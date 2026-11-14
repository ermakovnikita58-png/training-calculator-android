const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCode, productFromOpen } = require('../app/src/main/assets/barcode-food.js');

test('validates EAN, UPC-A and expands UPC-E without changing EAN-8', () => {
  assert.equal(normalizeCode('4006381333931'), '4006381333931');
  assert.equal(normalizeCode('96385074', 'ean_8'), '96385074');
  assert.equal(normalizeCode('036000291452', 'upc_a'), '036000291452');
  assert.equal(normalizeCode('04252614', 'upc_e'), '042100005264');
  for (const invalid of ['4006381333930', '000123', 'a036000291452', '04252615']) assert.equal(normalizeCode(invalid), null);
});

const product = {
  code: '4006381333931', product_name: 'Food', brands: 'Maker', quantity: '400 g', serving_size: '25 g',
  nutriments: { 'energy-kcal_100g': 102, proteins_100g: 5, fat_100g: 3, carbohydrates_100g: 14 }
};
test('uses only 100-unit fields and preserves mass, volume and servings', () => {
  const food = productFromOpen(product);
  assert.deepEqual([food.unit, food.packageSize, food.serving, food.cal], ['g', 400, 25, 102]);
  const drink = productFromOpen({ ...product, quantity: '1,5 l', serving_size: '200 ml' });
  assert.deepEqual([drink.unit, drink.packageSize, drink.serving], ['ml', 1500, 200]);
  assert.equal(productFromOpen({ ...product, quantity: '1 l' }), null);
  assert.equal(productFromOpen({ ...product, quantity: '', serving_size: '' }), null);
  assert.equal(productFromOpen({ ...product, nutriments: { ...product.nutriments, proteins_100g: '' } }), null);
  assert.equal(productFromOpen({ ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': undefined, 'energy-kcal_value': 200 } }), null);
});
