let getOkForCurrentHour = (sTime, eTime, callback) => {
    //console.log("here we go!");
    connection.on("connect", function (err) {
        if (err) {
            console.log("Error:", err);
        }
        request = new Request(`select count(*) From [database] where chktime >= @startT and chktime < @endT`, function (err) {
            if (err) {
                console.log(err);
            }
            /*
              next request can go here:
              
              const request = new Request('SELECT * FROM foobar...', (err, rowCount) => {
                if(err) {
                    console.log(err);
                } 
                console.log(row count!);
                const anotherRequest = new Request('SELECT * FROM ...', (err, rowCount) => {
                    if(err) {
                        console.log(err)
                    }
                    ...
                })
                connection.execSql(anotherRequest);
              });
              connection.execSql(request);
            */
        });

        request.addParameter('startT', TYPES.DateTime, sTime)
        request.addParameter('endT', TYPES.DateTime, eTime)

        request.on("row", function (columns) {
            result = columns[0].value
            console.log('resul: ', result)
        });

        request.on("doneInProc", (rowCount, more) => {
            console.log(callback)
            callback(result)
            result = "";
        });

        connection.execSql(request);
    });
}