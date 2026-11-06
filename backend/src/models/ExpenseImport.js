import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 text:{type:String,required:true,maxlength:16000},instructions:{type:String,default:'',maxlength:8000},
 sources:{type:[mongoose.Schema.Types.Mixed],required:true},rows:{type:[mongoose.Schema.Types.Mixed],required:true},
 periodo:{mes:Number,anio:Number},method:String,warnings:[String],
 status:{type:String,enum:['draft','saving','committed'],default:'draft'},
 singleNonce:String,fingerprint:{type:String,unique:true},commitHash:String,commitRows:[mongoose.Schema.Types.Mixed],expenseIds:[mongoose.Schema.Types.ObjectId],
 savedAt:Date,createdAt:{type:Date,default:Date.now}
});
export default mongoose.models.ExpenseImport || mongoose.model('ExpenseImport',schema);
