var mysql = require("mysql")
var pool = mysql.createPool(
    {
        host:'localhost',
        port:'3306',
        user:'root',
        password:'mysql@123',
        database:'researchweb',
        multipleStatements:true,
        connectionLimit:100
    }
)

module.exports =pool