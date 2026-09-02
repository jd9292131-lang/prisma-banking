require('dotenv').config();

const pool = require('./database');

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD definida:', !!process.env.DB_PASSWORD);

async function testDatabase() {
    try {
        const result = await pool.query(
            'SELECT current_database(), NOW() AS data_hora'
        );

        console.log('PostgreSQL conectado com sucesso.');
        console.log('Base de dados:', result.rows[0].current_database);
        console.log('Data/hora:', result.rows[0].data_hora);

    } catch (error) {
        console.error('Erro ao conectar ao PostgreSQL:');
        console.error(error.message);

    } finally {
        await pool.end();
    }
}

testDatabase();