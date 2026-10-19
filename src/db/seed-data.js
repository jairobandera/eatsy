// Datos iniciales (migrados de los seeders del proyecto Laravel original).

export const usuarios = [
  { nombre: 'Admin', contrasena: '123456789', rol: 'Administrador' },
  { nombre: 'Cajero1', contrasena: '123456789', rol: 'Cajero' },
  { nombre: 'Cajero2', contrasena: '123456789', rol: 'Cajero' },
  { nombre: 'Cocina1', contrasena: '123456789', rol: 'Cocina' },
  { nombre: 'Cocina2', contrasena: '123456789', rol: 'Cocina' },
  { nombre: 'Kiosco1', contrasena: '123456789', rol: 'Cliente' },
];

export const categorias = [
  'Combos', 'Hamburguesas', 'Pizzas', 'Empanadas', 'Bebidas', 'Postres', 'Ensaladas', 'Snacks', 'Salsas',
  'Desayunos', 'Entradas', 'Platos Fuertes', 'Pastas', 'Panes', 'Opciones Vegetarianas', 'Opciones Veganas',
  'Cafetería', 'Bebidas Alcohólicas', 'Menú Infantil', 'Especiales del Día',
];

export const ingredientes = [
  ['Carne de Res', 'Carne de res de alta calidad, jugosa y bien sazonada.'],
  ['Pechuga de Pollo', 'Pechuga de pollo tierna, grillada o empanizada.'],
  ['Lechuga', 'Hojas de lechuga fresca, crujiente y lavada.'],
  ['Tomate', 'Rodajas de tomate fresco, maduro y jugoso.'],
  ['Pepinillos', 'Pepinillos encurtidos, agridulces y crujientes.'],
  ['Cebolla', 'Cebolla fresca, cortada en rodajas finas o caramelizada.'],
  ['Queso Cheddar', 'Queso cheddar fundido, cremoso y sabroso.'],
  ['Bacon', 'Tiras de bacon crujiente, ahumado y salado.'],
  ['Pan Artesanal', 'Pan artesanal horneado, suave y ligeramente tostado.'],
  ['Salsa BBQ', 'Salsa barbacoa dulce y ahumada.'],
  ['Mayonesa', 'Mayonesa cremosa, clásica o vegana.'],
  ['Ketchup', 'Ketchup clásico, dulce y ligeramente ácido.'],
  ['Mostaza', 'Mostaza suave con un toque picante.'],
  ['Jalapeños', 'Jalapeños frescos o encurtidos, con un toque picante.'],
  ['Queso Mozzarella', 'Queso mozzarella fresco, ideal para pizzas y empanadas.'],
  ['Salsa de Tomate', 'Salsa de tomate casera, elaborada con hierbas frescas.'],
  ['Albahaca', 'Hojas de albahaca fresca, aromática y vibrante.'],
  ['Queso Parmesano', 'Queso parmesano rallado, intenso y salado.'],
  ['Queso Gorgonzola', 'Queso gorgonzola, cremoso con sabor fuerte.'],
  ['Aceitunas', 'Aceitunas negras o verdes, suaves y sabrosas.'],
  ['Tomate Cherry', 'Tomates cherry frescos, dulces y jugosos.'],
  ['Queso Feta', 'Queso feta desmenuzado, salado y cremoso.'],
  ['Rúcula', 'Hojas de rúcula fresca, con sabor ligeramente picante.'],
  ['Palta', 'Palta madura, cremosa y rica en sabor.'],
  ['Huevo', 'Huevo cocido o frito, fresco y de granja.'],
  ['Jamón Cocido', 'Jamón cocido en finas lonchas, suave y sabroso.'],
  ['Ricota', 'Ricota fresca, suave y cremosa para pastas.'],
  ['Quinoa', 'Quinoa cocida, ligera y nutritiva.'],
  ['Garbanzos', 'Garbanzos cocidos, ideales para ensaladas y bowls.'],
  ['Vegetales Asados', 'Mix de vegetales asados (zapallo, berenjena, zucchini).'],
  ['Mascarpone', 'Queso mascarpone cremoso, ideal para postres.'],
  ['Dulce de Leche', 'Dulce de leche artesanal, dulce y cremoso.'],
  ['Frutos Rojos', 'Mix de frutos rojos frescos (frambuesas, arándanos).'],
  // Faltaban en el seeder original (las asignaciones se perdían en silencio):
  ['Pepperoni', 'Rodajas de pepperoni levemente picante.'],
  ['Morrón', 'Morrón rojo asado en tiras.'],
  ['Café', 'Café espresso de tueste medio.'],
  ['Cacao', 'Cacao amargo en polvo.'],
  ['Crema', 'Crema de leche batida.'],
  ['Queso Crema', 'Queso crema suave para postres.'],
  ['Croutones', 'Cubos de pan tostado y crocante.'],
  ['Aderezo César', 'Aderezo cremoso estilo César.'],
  ['Papa', 'Papas seleccionadas cortadas en bastones.'],
  ['Sal', 'Sal fina.'],
  ['Pan Rallado', 'Pan rallado para empanizar.'],
  ['Masa de Croissant', 'Masa hojaldrada de manteca.'],
];

/** Precio por unidad extra de cada ingrediente (los que no figuran no se ofrecen como extra). */
export const preciosExtra = {
  'Carne de Res': 150, 'Pechuga de Pollo': 120, 'Queso Cheddar': 50, 'Bacon': 70, 'Queso Mozzarella': 50,
  'Huevo': 40, 'Palta': 60, 'Jamón Cocido': 50, 'Jalapeños': 30, 'Pepperoni': 60, 'Queso Parmesano': 40,
  'Queso Feta': 50, 'Aceitunas': 30, 'Tomate': 20, 'Dulce de Leche': 40, 'Frutos Rojos': 50, 'Crema': 30,
  'Salsa BBQ': 0, 'Mayonesa': 0, 'Ketchup': 0, 'Mostaza': 0, 'Cebolla': 0, 'Lechuga': 0,
};

const img = (file) => `/img/productos/${file}`;

// [nombre, descripcion, precio, imagen, categorias, ingredientes [nombre, obligatorio]]
export const productos = [
  ['Big Gourmet', 'Hamburguesa de 200g con queso cheddar, lechuga, tomate y salsa especial.', 650, img('2OiE8PKIJ6OO69D3cKHA2nYvMYI4QdkL3GViGPaf.jpg'), ['Hamburguesas', 'Combos'],
    [['Carne de Res', 1], ['Pan Artesanal', 1], ['Queso Cheddar', 0], ['Lechuga', 0], ['Tomate', 0], ['Mayonesa', 0]]],
  ['Veggie Burger', 'Hamburguesa vegana con medallón de lentejas, rúcula y mayonesa vegana.', 580, img('owsefBAUwfcX27u4qN2C8K4ziNLdPUvQPw1md8ey.jpg'), ['Hamburguesas', 'Opciones Vegetarianas', 'Opciones Veganas'],
    [['Pan Artesanal', 1], ['Quinoa', 1], ['Rúcula', 0], ['Mayonesa', 0], ['Tomate', 0]]],
  ['Bacon Cheese', 'Hamburguesa con panceta crocante, queso mozzarella y salsa BBQ.', 700, img('tgij9MXPcNOjHDsYJSdztS7v9BaNzM6BPdnxCP9W.jpg'), ['Hamburguesas'],
    [['Carne de Res', 1], ['Pan Artesanal', 1], ['Bacon', 1], ['Queso Mozzarella', 1], ['Salsa BBQ', 0]]],
  ['Pizza Margherita', 'Pizza con salsa de tomate, mozzarella fresca y albahaca.', 900, img('yBTmN47ouejO7xEdUEK9hj1jt7OTudGzkxe6G9JA.jpg'), ['Pizzas'],
    [['Salsa de Tomate', 1], ['Queso Mozzarella', 1], ['Albahaca', 0]]],
  ['Pizza Pepperoni', 'Pizza con salsa de tomate, mozzarella y pepperoni picante.', 950, img('42ztPTd2DQMuv4t34JTZj7nNntDLGGlGfcaVoPbb.jpg'), ['Pizzas'],
    [['Salsa de Tomate', 1], ['Queso Mozzarella', 1], ['Pepperoni', 1]]],
  ['Pizza Cuatro Quesos', 'Pizza con mozzarella, parmesano, gorgonzola y cheddar.', 1000, img('DsatbQnu7N9O0otdH0rwJogMaeVFcle8qcmvGJWU.jpg'), ['Pizzas', 'Opciones Vegetarianas'],
    [['Salsa de Tomate', 1], ['Queso Mozzarella', 1], ['Queso Parmesano', 1], ['Queso Gorgonzola', 1], ['Queso Cheddar', 1]]],
  ['Empanada de Carne', 'Empanada de carne cortada a cuchillo con cebolla y morrón.', 150, img('MZ4vaynU5BYxDUuQTI6OLzK0xH5GdjE7vtvUHG2d.jpg'), ['Empanadas'],
    [['Carne de Res', 1], ['Cebolla', 0], ['Morrón', 0]]],
  ['Empanada de Jamón y Queso', 'Empanada rellena de jamón cocido y mozzarella.', 140, img('KyBQMkwyou2m01g1AyBHdKC04xMguibut7Jb477M.jpg'), ['Empanadas', 'Menú Infantil'],
    [['Jamón Cocido', 1], ['Queso Mozzarella', 1]]],
  ['Empanada Caprese', 'Empanada con tomate, mozzarella y albahaca.', 145, img('xUer07ak7LhwegZnOuUjdWLXdnVVZX37js9koZWO.jpg'), ['Empanadas', 'Opciones Vegetarianas'],
    [['Queso Mozzarella', 1], ['Tomate', 1], ['Albahaca', 0]]],
  ['Coca-Cola 500ml', 'Refresco de cola bien frío.', 200, img('wqeeK4KMhBLp9WPY66c7a34LmaJR19awRzviIfAy.jpg'), ['Bebidas'], []],
  ['Café Latte', 'Café espresso con leche vaporizada.', 250, img('e8BTEpVHIdxMBU72WdNO6vO7S3BYb0GUdVVa3O8t.jpg'), ['Bebidas', 'Cafetería'], []],
  ['Jugo de Naranja', 'Jugo natural de naranjas frescas.', 220, img('9YLE2WkvDR05aB95NuX0zqAdynkdj9gyeH0Nr39n.jpg'), ['Bebidas', 'Menú Infantil'], []],
  ['Cerveza Artesanal IPA', 'Cerveza artesanal con notas cítricas.', 350, img('SIHVuJsEsBCXIN2jiy4aDiMTjFOYVyqxzis03bTv.jpg'), ['Bebidas', 'Bebidas Alcohólicas'], []],
  ['Tiramisú', 'Postre italiano con café, mascarpone y cacao.', 300, img('922DPqSuWZIjcwl3RqJ8vM6BR7de2f5xJ8PDlyKh.jpg'), ['Postres'],
    [['Mascarpone', 1], ['Café', 1], ['Cacao', 0]]],
  ['Flan Casero', 'Flan con dulce de leche y crema.', 250, img('f3h53i8GSJ7IRuNSBOxZG0nsupePsXRTUzQ2f2pU.jpg'), ['Postres'],
    [['Dulce de Leche', 0], ['Crema', 0]]],
  ['Cheesecake de Frutos Rojos', 'Tarta de queso con salsa de frutos rojos.', 320, img('NvS4oGL1qRB2nkjGvlciJ0w2iVgg80I3HalagKaH.jpg'), ['Postres'],
    [['Queso Crema', 1], ['Frutos Rojos', 1]]],
  ['Ensalada Mediterránea', 'Mix de hojas verdes, tomate cherry, aceitunas y feta.', 400, img('U6g0SYdvvQlAZ7mOAPPNTqX8e0Rm4bAK0hM9Lwss.jpg'), ['Ensaladas', 'Opciones Vegetarianas'],
    [['Lechuga', 1], ['Tomate Cherry', 1], ['Aceitunas', 0], ['Queso Feta', 0]]],
  ['Ensalada de Pollo', 'Lechuga, pollo grillado, croutones y aderezo César.', 450, img('M8KzhnyG92iLBVJAYLnqsb3nvUo4tcXN7hK5n6Yx.jpg'), ['Ensaladas'],
    [['Lechuga', 1], ['Pechuga de Pollo', 1], ['Croutones', 0], ['Aderezo César', 0]]],
  ['Papas Fritas Clásicas', 'Papas crujientes con sal.', 200, img('Yn6fVhvdWAPZqcEChdHdNVOYrbmBIPe3mOjo3sWW.jpg'), ['Snacks', 'Menú Infantil'],
    [['Papa', 1], ['Sal', 0]]],
  ['Bastones de Mozzarella', 'Palitos de mozzarella empanizados.', 280, img('vu2L24jA22LxLmKQGYdvmGXrFyxpXflBIHZv9cZt.jpg'), ['Snacks', 'Entradas'],
    [['Queso Mozzarella', 1], ['Pan Rallado', 1]]],
  ['Tostadas con Palta', 'Tostadas de pan artesanal con palta y huevo.', 350, img('Z9khoESY9T9RdbEpsGIF7KgANno33r10wbtrhfJ9.jpg'), ['Desayunos', 'Opciones Vegetarianas'],
    [['Pan Artesanal', 1], ['Palta', 1], ['Huevo', 0]]],
  ['Croissant de Jamón y Queso', 'Croissant relleno de jamón cocido y queso.', 300, img('I9u69YtymHNiKBTzRYDYvw7I9wVWZ2CnckIVLOpD.jpg'), ['Desayunos', 'Cafetería'],
    [['Masa de Croissant', 1], ['Jamón Cocido', 0], ['Queso Mozzarella', 0]]],
  ['Milanesa Napolitana', 'Milanesa de ternera con jamón, queso y salsa de tomate.', 800, img('diHmj9CXGm6aSndOC0triRXz13fg3aeqdcasezsz.jpg'), ['Platos Fuertes'],
    [['Carne de Res', 1], ['Queso Mozzarella', 1], ['Salsa de Tomate', 1], ['Jamón Cocido', 0]]],
  ['Ravioles de Ricota', 'Pasta rellena de ricota con salsa pomodoro.', 700, img('nwzuFnLz9Y43WrxlshG9IgNZbpo1jqgp9sCcclvU.jpg'), ['Platos Fuertes', 'Pastas', 'Opciones Vegetarianas'],
    [['Ricota', 1], ['Salsa de Tomate', 1], ['Queso Parmesano', 0]]],
  ['Bowl Vegano', 'Quinoa, palta, garbanzos y vegetales asados.', 600, img('pVMMczK1rtHtCxZOEiBGc0atyzq98X0OBr8lguTq.jpg'), ['Opciones Veganas', 'Opciones Vegetarianas'],
    [['Quinoa', 1], ['Palta', 1], ['Garbanzos', 1], ['Vegetales Asados', 0]]],
];

/**
 * Promociones relativas a "hoy". tipo: porcentaje | monto.
 * Sin código se aplican solas (monto = $ por unidad). Con código son cupones ($ sobre el total). productos '*' = todos.
 * @param {(days:number)=>string} d  devuelve la fecha de hoy + n días
 */
export const promociones = (d) => [
  { nombre: 'Martes 2x1 en Pizzas', tipo_descuento: 'porcentaje', descuento: 50, codigo: null, fecha_inicio: d(0), fecha_fin: d(7),
    productos: ['Pizza Margherita', 'Pizza Pepperoni', 'Pizza Cuatro Quesos'] },
  { nombre: 'Happy Hour Bebidas', tipo_descuento: 'porcentaje', descuento: 30, codigo: null, fecha_inicio: d(0), fecha_fin: d(7),
    productos: ['Coca-Cola 500ml', 'Café Latte', 'Cerveza Artesanal IPA'] },
  { nombre: 'Combo Familiar', tipo_descuento: 'monto', descuento: 100, codigo: null, fecha_inicio: null, fecha_fin: null,
    productos: ['Big Gourmet', 'Bacon Cheese'] },
  { nombre: 'Lunes Saludable', tipo_descuento: 'porcentaje', descuento: 20, codigo: null, fecha_inicio: d(0), fecha_fin: d(7),
    productos: ['Veggie Burger', 'Ensalada Mediterránea', 'Ensalada de Pollo', 'Bowl Vegano', 'Jugo de Naranja'] },
  { nombre: 'Jueves de Empanadas', tipo_descuento: 'monto', descuento: 30, codigo: null, fecha_inicio: d(3), fecha_fin: d(10),
    productos: ['Empanada de Carne', 'Empanada de Jamón y Queso', 'Empanada Caprese'] },
  { nombre: 'Fin de Semana Dulce', tipo_descuento: 'porcentaje', descuento: 25, codigo: null, fecha_inicio: d(4), fecha_fin: d(6),
    productos: ['Tiramisú', 'Flan Casero', 'Cheesecake de Frutos Rojos'] },
  // Cupón: se descuenta del total cuando el cliente ingresa el código (kiosco o caja).
  { nombre: 'Cupón de bienvenida', tipo_descuento: 'monto', descuento: 100, codigo: 'BIENVENIDA', fecha_inicio: null, fecha_fin: null,
    productos: '*' },
];

export const clientes = [
  ['Lucía', 'Fernández', '45678912', '091234567', 120],
  ['Martín', 'Rodríguez', '38291045', '098765432', 45],
  ['Sofía', 'González', '51234876', '094112233', 300],
  ['Diego', 'Pérez', '29876543', '099887766', 0],
  ['Valentina', 'Silva', '47812309', '092334455', 75],
  ['Joaquín', 'Martínez', '50987123', '095667788', 10],
];

export const reglasPuntos = [
  { monto_min: 0, monto_max: 499.99, puntos_base: 1 },
  { monto_min: 500, monto_max: 999.99, puntos_base: 5 },
  { monto_min: 1000, monto_max: 1999.99, puntos_base: 12 },
  { monto_min: 2000, monto_max: 999999, puntos_base: 25 },
];
