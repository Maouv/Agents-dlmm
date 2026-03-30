require('dotenv').config();

console.log('Environment variables check:');
console.log('MODAL_API_KEY_1:', process.env.MODAL_API_KEY_1 ? 'SET (length: ' + process.env.MODAL_API_KEY_1.length + ')' : 'NOT SET');
console.log('MODAL_API_KEY_2:', process.env.MODAL_API_KEY_2 ? 'SET (length: ' + process.env.MODAL_API_KEY_2.length + ')' : 'NOT SET');
console.log('MODAL_API_KEY_3:', process.env.MODAL_API_KEY_3 ? 'SET (length: ' + process.env.MODAL_API_KEY_3.length + ')' : 'NOT SET');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET' : 'NOT SET');
