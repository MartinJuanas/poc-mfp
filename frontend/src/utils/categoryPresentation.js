import { categories } from './categories';
export const categoryStyle = key => ({ supermercado:['bulk','mint'], comida:['sun','amber'], servicios:['document','blue'], alquiler:['goals','violet'], transporte:['arrow','blue'], salida:['chat','violet'], salud:['plus','mint'], facturas:['document','amber'], otros:['expenses','neutral'] }[key] || ['expenses','blue']);
export const categoryName = key => key === 'facturas' ? 'Facturas de gasto' : categories[key] || key;
