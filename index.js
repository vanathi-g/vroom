require("dotenv").config();

const express = require('express')
const session = require('express-session')
const mysql = require('mysql')
const app = express()
const port = 3000

var path = require('path');
app.use(express.static(path.join(__dirname, 'public')))

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');

// TO PARSE REQUEST BODY

bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({
    extended: true
}));

// SESSION MANAGEMENT

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 60000
    }
}));

// DB CONNECTION

const host = process.env.MYSQL_HOST;
const database = process.env.MYSQL_DB;

console.log(`\nConnecting to database ${database} on ${host}\n`);

var connection = mysql.createConnection({
    host: process.env.MYSQL,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
});

connection.connect()

/* ROUTING */

app.get('/', function (req, res) {
    res.render('home', {
        title: "Home",
        logged_in: session.user ? true : false
    });
});

// Authentication

app.get('/login', function (req, res) {
    if (req.session.user) {
        res.redirect(`/${req.session.type}`);
    } else {
        res.render('login', {
            title: "Home",
            logged_in: false,
            message: ''
        });
    }
});

app.post('/login', function (req, res) {
    const email = req.body.email;
    const password = req.body.password;

    sessionData = req.session;
    sessionData.user = {};

    let message = '';

    connection.query(`SELECT * FROM accounts WHERE email="${email}" and password="${password}"`, function (err, results, fields) {
        if (results.length > 0) {
            sessionData.user = results[0];
            if (results[0].type === "driver")
                res.redirect('/driver');
            else {
                let id = results[0].id
                connection.query(`SELECT zip, city, state FROM hirers WHERE id="${id}"`, function (err, results, fields) {
                    sessionData.user['zip'] = results[0].zip;
                    sessionData.user['city'] = results[0].city;
                    sessionData.user['state'] = results[0].state;
                    res.redirect('/hirer');
                })
            }
        } else {
            res.render('login', {
                title: "Home",
                logged_in: false,
                message: "Login failed... Please try again!",
            });
        }
    });
});

app.get('/register-hirer', function (req, res) {
    if (req.session.user) {
        res.redirect(`/${req.session.user.type}`)
    } else {
        res.render('reghirer', {
            title: "Register",
            logged_in: false,
        });
    }
});

app.get('/register-driver', function (req, res) {
    if (req.session.user) {
        res.redirect(`/${req.session.user.type}`)
    } else {
        res.render('regdriver', {
            title: "Register",
            logged_in: false,
        });
    }
});

app.post('/register', function (req, res) {
    let pwd = req.body.pwd;
    let type = req.body.type;
    let email = req.body.email;
    let created = req.body;
    let id = 0;

    if (type === "driver") {
        created['capacity'] = parseInt(created['capacity']);
        created['loadtype'] = created['loadtype'].toString();
    }

    delete created.email;
    delete created.pwd;
    delete created.pwdcheck;
    delete created.type;

    connection.query(`INSERT INTO ${type}s VALUES(NULL, ?)`, [Object.values(created)], function (err, results) {
        if (err) throw err;
        else {
            connection.query(` SELECT LAST_INSERT_ID()`, function (err, results) {
                if (err) throw err;
                else {
                    id = results[0]['LAST_INSERT_ID()'];
                    connection.query(`INSERT INTO accounts VALUES("${id}", "${type}", "${pwd}", "${email}")`, function (err, results) {
                        if (err) throw err;
                    })
                    if (type == "driver") {
                        connection.query(`INSERT INTO locations VALUES("${id}", "${created.zip}", "${created.city}", "${created.state}")`, function (err, results) {
                            if (err) throw err;
                        })
                    }
                }
            })
        }
    })
    res.redirect('/login');
});

app.get('/logout', function (req, res) {
    sessionData = req.session;
    sessionData.destroy(function (err) {
        if (err) {
            console.log('Error destroying session.');
        } else {
            console.log('Session destroyed successfully.');
        }
        res.redirect('/');
    });
});

// Home Pages for Driver and Hirer

app.get('/driver', function (req, res) {
    if (req.session.user) {
        let driver = req.session.user;
        const query = `SELECT * FROM trips WHERE(driver_id='${driver.id}' AND status='unconfirmed')`
        connection.query(query, function (err, results) {
            res.render('driver', {
                title: "Home",
                logged_in: true,
                requests: results,
                upcoming: upcoming
            });
        })
    } else {
        res.redirect('/login');
    }
});

app.post('/driver', function (req, res) {
    const query = `UPDATE trips SET status = 'confirmed' WHERE trip_id=${req.body.accepted_trip_id}`
    connection.query(query, function (err, results) {
        if (err) throw err;
        res.redirect('/driver');
    });
})

app.get('/hirer', function (req, res) {
    if (req.session.user) {
        let hirer = req.session.user;
        const query = `SELECT * FROM drivers WHERE(zip='${hirer.zip}' OR city='${hirer.state}' OR state='${hirer.city}')`
        connection.query(query, function (err, results) {
            res.render('hirer', {
                title: "Home",
                logged_in: true,
                nearby: results
            });
        });
    } else {
        res.redirect('/login');
    }
});

// Booking page for Hirers

app.get('/book', function (req, res) {
    if (req.session.user) {
        res.render('book', {
            title: "Book Now!",
            logged_in: true,
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/book', function (req, res) {
    let load = {
        hirerid: req.session.user.id,
        weight: req.body.loadwt,
        type: req.body.loadtype
    }
    let trip = req.body;

    delete trip.loadwt;
    delete trip.loadtype;
    trip.pickuptime = trip.pickuptime.replace('T', ' ') + ':00';
    trip.status = "unconfirmed";

    connection.query(`INSERT INTO loads VALUES(NULL, ?)`, [Object.values(load)], function (err, results) {
        if (err) throw err;
        else {
            connection.query(`SELECT LAST_INSERT_ID()`, function (err, results) {
                if (err) throw err;
                else {
                    let load_id = results[0]['LAST_INSERT_ID()'];
                    connection.query(`INSERT INTO trips VALUES(NULL, ?, ${driver_id}, ${load_id})`, [Object.values(trip)], function (err, results) {
                        if (err) throw err;
                    })
                }
            })
        }
    })
    res.redirect('/hirer');
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});