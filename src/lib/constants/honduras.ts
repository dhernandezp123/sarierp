// src/lib/constants/honduras.ts
// Departamentos y ciudades principales de Honduras

export const DEPARTAMENTOS_HN = [
  'Atlántida',
  'Choluteca',
  'Colón',
  'Comayagua',
  'Copán',
  'Cortés',
  'El Paraíso',
  'Francisco Morazán',
  'Gracias a Dios',
  'Intibucá',
  'Islas de la Bahía',
  'La Paz',
  'Lempira',
  'Ocotepeque',
  'Olancho',
  'Santa Bárbara',
  'Valle',
  'Yoro',
] as const

export type DepartamentoHN = (typeof DEPARTAMENTOS_HN)[number]

// Ciudades principales por departamento
export const CIUDADES_POR_DEPARTAMENTO: Record<string, string[]> = {
  'Atlántida':          ['La Ceiba', 'El Porvenir', 'Esparta', 'Jutiapa', 'La Masica', 'San Francisco', 'Tela', 'Arizona'],
  'Choluteca':          ['Choluteca', 'Apacilagua', 'Concepción de María', 'Duyure', 'El Corpus', 'El Triunfo', 'Marcovia', 'Morolica', 'Namasigüe', 'Orocuina', 'Pespire', 'San Antonio de Flores', 'San Isidro', 'San José', 'San Marcos de Colón', 'Santa Ana de Yusguare'],
  'Colón':              ['Trujillo', 'Balfate', 'Iriona', 'Limón', 'Sabá', 'Santa Fe', 'Santa Rosa de Aguán', 'Sonaguera', 'Tocoa', 'Bonito Oriental'],
  'Comayagua':          ['Comayagua', 'Ajuterique', 'El Rosario', 'Esquías', 'Humuya', 'La Libertad', 'Lamaní', 'La Trinidad', 'Lejamaní', 'Meámbar', 'Minas de Oro', 'Ojos de Agua', 'San Jerónimo', 'San José de Comayagua', 'San José del Potrero', 'San Luis', 'San Sebastián', 'Siguatepeque', 'Trinidad de Comayagua', 'Villa de San Antonio'],
  'Copán':              ['Santa Rosa de Copán', 'Cabañas', 'Concepción', 'Copán Ruinas', 'Corquín', 'Cucuyagua', 'Dolores', 'Dulce Nombre', 'El Paraíso', 'Florida', 'La Jigua', 'La Unión', 'Nueva Arcadia', 'San Agustín', 'San Antonio', 'San Jerónimo', 'San José', 'San Juan de Opoa', 'San Nicolás', 'San Pedro', 'Santa Rita', 'Trinidad de Copán', 'Veracruz'],
  'Cortés':             ['San Pedro Sula', 'Puerto Cortés', 'Choloma', 'La Lima', 'El Progreso', 'Villanueva', 'Omoa', 'Pimienta', 'Potrerillos', 'San Antonio de Cortés', 'San Francisco de Yojoa', 'San Manuel', 'Santa Cruz de Yojoa', 'Travesía'],
  'El Paraíso':         ['Yuscarán', 'Alauca', 'Danlí', 'El Paraíso', 'Güinope', 'Jacaleapa', 'Liure', 'Morocelí', 'Oropolí', 'Potrerillos', 'San Antonio de Flores', 'San Lucas', 'San Matías', 'Soledad', 'Teupasenti', 'Texiguat', 'Vado Ancho', 'Yauyupe', 'Trojes'],
  'Francisco Morazán':  ['Tegucigalpa', 'Cedros', 'Comayagüela', 'Curaren', 'El Porvenir', 'Guaimaca', 'La Libertad', 'La Venta', 'Lepaterique', 'Maraita', 'Marale', 'Nueva Armenia', 'Ojojona', 'Orica', 'Reitoca', 'Sabanagrande', 'San Antonio de Oriente', 'San Buenaventura', 'San Ignacio', 'San Juan de Flores', 'San Miguelito', 'Santa Ana', 'Santa Lucía', 'Talanga', 'Tatumbla', 'Valle de Ángeles', 'Villa de San Francisco', 'Vallecillo'],
  'Gracias a Dios':     ['Puerto Lempira', 'Ahuas', 'Juan Francisco Bulnes', 'Ramón Villeda Morales', 'Wampusirpe'],
  'Intibucá':           ['La Esperanza', 'Camasca', 'Colomoncagua', 'Concepción', 'Dolores', 'Intibucá', 'Jesús de Otoro', 'Magdalena', 'Masaguara', 'San Antonio', 'San Francisco de Opalaca', 'San Isidro', 'San Juan', 'San Marcos de la Sierra', 'San Miguelito', 'Santa Lucía', 'Yamaranguila', 'San Francisco de Becerra'],
  'Islas de la Bahía':  ['Roatán', 'Guanaja', 'José Santos Guardiola', 'Utila'],
  'La Paz':             ['La Paz', 'Aguanqueterique', 'Cabañas', 'Cane', 'Chinacla', 'Guajiquiro', 'Lauterique', 'Marcala', 'Mercedes de Oriente', 'Opatoro', 'San Antonio del Norte', 'San Juan', 'San Miguel Guancapla', 'San Pedro de Tutule', 'Santa Ana', 'Santa Elena', 'Santa María', 'Santiago de Puringla', 'Yarula'],
  'Lempira':            ['Gracias', 'Belén', 'Candelaria', 'Cololaca', 'Erandique', 'Gualcince', 'Guarita', 'La Campa', 'La Iguala', 'Las Flores', 'La Unión', 'La Virtud', 'Lepaera', 'Mapulaca', 'Piraera', 'San Andrés', 'San Francisco', 'San Juan Guarita', 'San Manuel Colohete', 'San Rafael', 'San Sebastián', 'Santa Cruz', 'Talgua', 'Tambla', 'Tomalá', 'Valladolid', 'Virginia', 'San Marcos de Caiquín'],
  'Ocotepeque':         ['Nueva Ocotepeque', 'Belén Gualcho', 'Concepción', 'Dolores Merendón', 'Fraternidad', 'La Encarnación', 'La Labor', 'Lucerna', 'Mercedes', 'San Fernando', 'San Francisco del Valle', 'San Jorge', 'San Marcos', 'Santa Fe', 'Sensenti', 'Sinuapa'],
  'Olancho':            ['Juticalpa', 'Campamento', 'Catacamas', 'Concordia', 'Dulce Nombre de Culmí', 'El Rosario', 'Esquipulas del Norte', 'Gualaco', 'Guarizama', 'Guata', 'Guayape', 'Jano', 'La Unión', 'Mangulile', 'Manto', 'Salama', 'San Esteban', 'San Francisco de Becerra', 'San Francisco de la Paz', 'Santa María del Real', 'Silca', 'Yocón', 'Patuca'],
  'Santa Bárbara':      ['Santa Bárbara', 'Arada', 'Atima', 'Azacualpa', 'Ceguaca', 'Chinda', 'Concepción del Norte', 'Concepción del Sur', 'El Níspero', 'Gualala', 'Ilama', 'Las Vegas', 'Macuelizo', 'Naranjito', 'Nuevo Celilac', 'Petoa', 'Protección', 'Quimistán', 'San Francisco de Ojuera', 'San José de Colinas', 'San Luis', 'San Marcos', 'San Nicolás', 'San Pedro Zacapa', 'San Vicente Centenario', 'Santa Rita', 'Trinidad'],
  'Valle':              ['Nacaome', 'Alianza', 'Amapala', 'Aramecina', 'Caridad', 'Goascorán', 'Langue', 'San Francisco de Coray', 'San Lorenzo'],
  'Yoro':               ['Yoro', 'Arenal', 'El Negrito', 'El Progreso', 'Jocón', 'Morazán', 'Olanchito', 'Santa Rita', 'Sulaco', 'Victoria', 'Yorito'],
}

// Ciudades de otros países frecuentes en freight forwarding
export const CIUDADES_INTERNACIONALES: Record<string, string[]> = {
  'Guatemala':    ['Guatemala City', 'Quetzaltenango', 'Puerto Barrios', 'Escuintla'],
  'El Salvador':  ['San Salvador', 'Santa Ana', 'San Miguel', 'La Unión'],
  'Nicaragua':    ['Managua', 'León', 'Granada', 'Corinto'],
  'Costa Rica':   ['San José', 'Limón', 'Cartago', 'Alajuela'],
  'México':       ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Veracruz'],
  'Estados Unidos': ['Miami', 'New York', 'Los Angeles', 'Houston', 'Dallas'],
  'China':        ['Shanghái', 'Shenzhen', 'Guangzhou', 'Ningbo', 'Tianjin', 'Qingdao', 'Beijing'],
  'España':       ['Madrid', 'Barcelona', 'Valencia', 'Sevilla'],
  'Alemania':     ['Hamburgo', 'Frankfurt', 'Múnich', 'Bremen'],
}

export const PAISES_FRECUENTES = [
  'Honduras',
  'Guatemala',
  'El Salvador',
  'Nicaragua',
  'Costa Rica',
  'México',
  'Estados Unidos',
  'China',
  'España',
  'Alemania',
  'Colombia',
  'Panamá',
  'Otro',
] as const