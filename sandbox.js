const TYPES = require('tedious').TYPES;
const Connection = require('./lib/connection');
const Request = require('./lib/request');

const config = {
    "server": "localhost",
    "authentication": {
        "type": "default",
        "options": {
            "userName": "sa",
            "password": "Password_123"
        }
    },
    "options": {
        "port": 60543,
        "database": "master"
    }
}

// var connection = new Connection(config);

let connection;



main().catch(error => console.log(error)).finally(() => process.exit());

async function main() {
	const connectionErrors = [];

	await connect();

    connection.on('errorMessage', error => connectionErrors.push(error));
    
    // connection.on('debug', function (text) {
    //     console.log('debug txt: ', text);
    // }
    // );
	try {
		await createInvalidType();
	} catch (requestError) {
		console.log('Connection errors:', connectionErrors.map(error => error.message));
		console.log('Request error:', requestError.message);
	}
}

function connect() {
	return new Promise((resolve, reject) => {
		connection = new Connection(config);

		connection.on('connect', (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

function createInvalidType() {
	return new Promise((resolve, reject) => {
		const statement = `create type test_type as table ( id int, primary key (code) );`;
		const request = new Request(statement, (err, rowCount) => {
			if (err) {
				reject(err);
			} else {
				resolve(rowCount);
			}
		});

		connection.execSql(request);
	});
}

