import test from 'node:test';
import assert from 'node:assert/strict';
import {temporal,definitelyBefore} from '../app/dates.mjs';

test('FHIR dates retain year, month and day precision',()=>{
  for(const [date,precision] of [['2024','year'],['2024-02','month'],['2024-02-29','day']]){const t=temporal(date,'date');assert.equal(t.valid,true);assert.equal(t.precision,precision);assert.ok(t.bounds.lo<t.bounds.hi);}
  assert.equal(definitelyBefore(temporal('2024'),temporal('2024-06')),false);
  assert.equal(definitelyBefore(temporal('2023'),temporal('2024')),true);
});
test('date parser applies Gregorian leap years and bounds, including years below 100',()=>{
  for(const value of ['0001-01-01','0099-12-31','2000-02-29','9999-12-31'])assert.equal(temporal(value,'date').valid,true,value);
  for(const value of ['0000-01-01','1900-02-29','2023-02-29','2024-04-31','2024-13','2024-00','2024-01-00','10000-01-01'])assert.equal(temporal(value,'date').valid,false,value);
  assert.ok(definitelyBefore(temporal('0099'),temporal('0100')));
});
test('timestamps require seconds and timezone; instants require a timestamp',()=>{
  for(const value of ['2024-01-01T00:00:00Z','2024-01-01T23:59:59+14:00','2024-01-01T00:00:00-14:00'])assert.equal(temporal(value,'instant').valid,true,value);
  for(const value of ['2024-01-01T00:00Z','2024-01-01T00:00:00','2024-01-01T24:00:00Z','2024-01-01T00:60:00Z','2024-01-01T00:00:00+14:01','2024-01-01T00:00:00+15:00','2024-01-01T00:00:00+01:60','2024-01-01'])assert.equal(temporal(value,'instant').valid,false,value);
  assert.equal(temporal('2024-01-01T00:00:00Z','date').valid,false);
});
test('timestamps compare equivalent offsets and nanosecond precision exactly',()=>{
  const a=temporal('2024-01-01T10:00:00+02:00'),b=temporal('2024-01-01T08:00:00Z');
  assert.deepEqual(a.bounds,b.bounds);
  assert.equal(definitelyBefore(a,b),false);
  assert.equal(definitelyBefore(temporal('2024-01-01T08:00:00.000000001Z'),temporal('2024-01-01T08:00:00.000000002Z')),true);
});
test('mixed date and zoned instant comparison preserves timezone uncertainty',()=>{
  assert.equal(definitelyBefore(temporal('2024-01-01'),temporal('2024-01-02T01:00:00Z')),false);
  assert.equal(definitelyBefore(temporal('2024-01-01'),temporal('2024-01-03T00:00:00Z')),true);
});
test('leap seconds and finer than nanosecond timestamps are accepted but not ordered',()=>{
  for(const value of ['2016-12-31T23:59:60Z','2024-01-01T00:00:00.1234567891Z']){const a=temporal(value);assert.equal(a.valid,true);assert.equal(a.bounds,null);assert.equal(definitelyBefore(a,temporal('2025')),false);}
});
test('time primitives have no date or zone and reject invalid clock components',()=>{
  for(const value of ['00:00:00','23:59:59.123','23:59:60'])assert.equal(temporal(value,'time').valid,true);
  for(const value of ['12:30','24:00:00','12:60:00','12:00:61','12:00:00Z'])assert.equal(temporal(value,'time').valid,false);
});
