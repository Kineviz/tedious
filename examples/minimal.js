var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;


const fs = require('fs');

// const config = JSON.parse(
//   fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
// ).config;

const config = {
  "server": "tedious-sqlserver.database.windows.net",
  "authentication": {
    "type": "default",
    "options": {
      "userName": "TDSemTest",
      "password": "25FZW6WbhcqqkpES"
    }
  },
  "options": {
    "port": 1433,
    "database": "master",
    // "trustServerCertificate": true
  }
}

var connection = new Connection(config);

connection.connect(function(err) {
  // If no error, then good to go...
  if (err) {
    console.log(err);
  } else {
    executeStatement();
  }

}
);

connection.on('debug', function(text) {
  //console.log(text);
}
);

function executeStatement() {
  request = new Request("select 42, 'hello world'", function(err, rowCount) {
    if (err) {
      console.log(err);
    } else {
      console.log(rowCount + ' rows');
    }

    connection.close();
  });

  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  request.on('done', function(rowCount, more) {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
