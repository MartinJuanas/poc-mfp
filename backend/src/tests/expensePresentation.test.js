import { describe,it,expect } from 'vitest';
import { variation,topCategories } from '../../../frontend/src/utils/expensePresentation.js';
describe('Presentación del resumen de gastos',()=>{
 it('calcula variaciones y no inventa porcentajes sin base comparable',()=>{
  expect(variation(120,100)).toMatchObject({percent:20,direction:'up'});
  expect(variation(80,100)).toMatchObject({percent:-20,direction:'down'});
  expect(variation(-50,-100)).toMatchObject({percent:50,direction:'up'});
  expect(variation(0,0)).toMatchObject({percent:0,direction:'flat'});
  expect(variation(50,0).percent).toBeNull();expect(variation(50,undefined).percent).toBeNull();
 });
 it('top 5 y otras categorías conserva todos los centavos y registros sin mutar la entrada',()=>{
  const rows=[1,8,3,7,2,6,4].map((total,i)=>({categoria:String(i),total,count:1}));
  const result=topCategories(rows);
  expect(result).toHaveLength(6);expect(result.at(-1)).toEqual({categoria:'agrupadas',total:3,count:2});
  expect(result.reduce((sum,r)=>sum+r.total,0)).toBe(31);expect(rows[0].total).toBe(1);
  expect(topCategories([])).toEqual([]);
 });
});
