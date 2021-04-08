require("dotenv").config();

const express = require('express')
const app = express()
const port = 3000

var path = require('path');
app.use(express.static(path.join(__dirname, 'public')))

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');

// mysql connection
const host = process.env.MYSQL_HOST;
const database = process.env.MYSQL_DB;

console.log(`\nConnecting to database ${database} on ${host}\n`);

var mysql = require('mysql')
var connection = mysql.createConnection({
    host: process.env.MYSQL,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
})

var drivers = [];

connection.connect()

connection.query('SELECT * FROM drivers', function (err, rows, fields) {
    if (err) throw err
    drivers = rows;
})

connection.end()


app.get('/', function (req, res) {
    res.render('drivers', {
        drivers: drivers,
        title: "Driver List",
    });
});


app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})