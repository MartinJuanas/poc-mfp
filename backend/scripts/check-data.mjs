// Read-only preflight for existing installations. Does not create indexes or modify data.
import 'dotenv/config';
import mongoose from 'mongoose';
try {
 await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos');
 const receipts=mongoose.connection.db.collection('receipts');
 for(const field of ['fileHash','numeroRecibo']) {
  const duplicates=await receipts.aggregate([{$match:{[field]:{$type:'string',$ne:''}}},{$group:{_id:`$${field}`,count:{$sum:1},ids:{$push:'$_id'}}},{$match:{count:{$gt:1}}}]).toArray();
  console.log(`${field}: ${duplicates.length} grupos repetidos`);
  for(const group of duplicates)console.log(JSON.stringify({count:group.count,ids:group.ids}));
  if(duplicates.length)process.exitCode=2;
 }
 for(const name of ['receipts','expenses']) {
  const invalid=await mongoose.connection.db.collection(name).find({$or:[{'periodo.mes':{$exists:false}},{'periodo.mes':null},{'periodo.mes':{$lt:1}},{'periodo.mes':{$gt:12}},{'periodo.anio':{$exists:false}},{'periodo.anio':null},{'periodo.anio':{$lt:1900}},{'periodo.anio':{$gt:2100}}]},{projection:{_id:1,periodo:1}}).toArray();
  console.log(`${name}: ${invalid.length} registros sin período válido`);for(const record of invalid)console.log(JSON.stringify(record));if(invalid.length)process.exitCode=2;
 }
} catch(error) { console.error(`No se pudo revisar la base (${error.name}). Verificá MONGODB_URI y la conexión.`);process.exitCode=1; }
finally { await mongoose.disconnect(); }
