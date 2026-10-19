import { sql, transaction } from './connection.js';
import * as data from './seed-data.js';
import { categoriasRepo, ingredientesRepo, usuariosRepo } from '../repositories/catalogo.repositories.js';
import { clientesRepo, reglasPuntosRepo } from '../repositories/clientes.repository.js';
import { productosRepo } from '../repositories/productos.repository.js';
import { promocionesRepo } from '../repositories/promociones.repository.js';
import { addDays, today } from '../utils/dates.js';
import { hashPassword } from '../utils/password.js';
import { preciosVigentes, round2 } from '../services/pricing.service.js';

/** Carga usuarios, catálogo, promociones, clientes y reglas de puntos. */
export async function seedBase() {
  await transaction(async () => {
    for (const u of data.usuarios) {
      await usuariosRepo.insert({ nombre: u.nombre, contrasena: hashPassword(u.contrasena), rol: u.rol, activo: 1 });
    }

    const catIds = new Map();
    for (const nombre of data.categorias) catIds.set(nombre, await categoriasRepo.insert({ nombre, activo: 1 }));

    const ingIds = new Map();
    for (const [nombre, descripcion] of data.ingredientes) {
      ingIds.set(nombre, await ingredientesRepo.insert({ nombre, descripcion, precio_extra: data.preciosExtra[nombre] ?? null, activo: 1 }));
    }

    const prodIds = new Map();
    for (const [nombre, descripcion, precio, imagen, cats, ings] of data.productos) {
      const id = await productosRepo.insert({ nombre, descripcion, precio, imagen, activo: 1 });
      prodIds.set(nombre, id);
      await productosRepo.syncCategorias(id, cats.map((c) => catIds.get(c)));
      await productosRepo.syncIngredientes(id, ings.map(([n, obl]) => ({ id: ingIds.get(n), es_obligatorio: Boolean(obl) })));
    }

    const hoy = today();
    for (const { productos, ...promo } of data.promociones((n) => addDays(hoy, n))) {
      const id = await promocionesRepo.insert({ ...promo, activo: 1 });
      await promocionesRepo.syncProductos(id, productos === '*' ? [...prodIds.values()] : productos.map((p) => prodIds.get(p)));
    }

    for (const [nombre, apellido, cedula, telefono, puntos] of data.clientes) {
      await clientesRepo.insert({ nombre, apellido, cedula, telefono, puntos, activo: 1 });
    }

    for (const r of data.reglasPuntos) await reglasPuntosRepo.insert(r);
  });
  console.log('✔ Datos base cargados (usuarios, catálogo, promociones, clientes, reglas de puntos).');
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, '0');

/** Genera pedidos de ejemplo de los últimos `dias` días para ver las estadísticas. */
export async function seedDemo(dias = 14) {
  const productos = (await productosRepo.list({ activo: true })).rows;
  const precios = await preciosVigentes(productos);
  const clientes = (await clientesRepo.list({})).rows;
  const cajero = await sql.get(`SELECT id FROM usuarios WHERE rol = 'Cajero' LIMIT 1`);
  const kiosco = await sql.get(`SELECT id FROM usuarios WHERE rol = 'Cliente' LIMIT 1`);
  const hoy = today();
  let n = 0;

  await transaction(async () => {
    for (let d = dias; d >= 1; d--) {
      const fecha = addDays(hoy, -d);
      const cantidad = rand(6, 18);
      for (let i = 0; i < cantidad; i++) {
        const ts = `${fecha} ${pad(rand(11, 23))}:${pad(rand(0, 59))}:${pad(rand(0, 59))}`;
        const desdeKiosco = Math.random() < 0.55;
        const estado = Math.random() < 0.08 ? 'Cancelado' : 'Entregado';
        const metodo = Math.random() < 0.5 ? 'Efectivo' : 'Tarjeta';
        const cliente = !desdeKiosco && Math.random() < 0.4 ? pick(clientes) : null;

        const lineas = Array.from({ length: rand(1, 4) }, () => {
          const p = pick(productos);
          const cant = rand(1, 3);
          const { precio_final, descuento } = precios.get(p.id);
          return { p, cant, subtotal: round2(precio_final * cant), descuento: round2(descuento * cant) };
        });
        const total = round2(lineas.reduce((s, l) => s + l.subtotal, 0));
        const codigo = `DEM-${fecha.replaceAll('-', '').slice(2)}${pad(i)}${rand(10, 99)}`;

        const { insertId: pedidoId } = await sql.run('INSERT INTO pedidos SET ?', [
          {
            usuario_id: desdeKiosco ? kiosco.id : cajero.id,
            cliente_id: cliente?.id ?? null,
            origen: desdeKiosco ? 'Kiosco' : 'Caja',
            total,
            metodo_pago: metodo,
            estado,
            codigo,
            created_at: ts,
            updated_at: ts,
          },
        ]);
        for (const l of lineas) {
          await sql.run('INSERT INTO detalle_pedido SET ?', [
            { pedido_id: pedidoId, producto_id: l.p.id, cantidad: l.cant, precio_unitario: l.p.precio, descuento: l.descuento, subtotal: l.subtotal, created_at: ts },
          ]);
        }
        await sql.run('INSERT INTO pagos SET ?', [
          { pedido_id: pedidoId, tipo: metodo, monto: total, fecha: ts, estado: estado === 'Entregado' ? 'Completado' : 'Fallido', created_at: ts, updated_at: ts },
        ]);
        n++;
      }
    }
  });
  console.log(`✔ ${n} pedidos de demostración generados (últimos ${dias} días).`);
}
