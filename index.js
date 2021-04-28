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
        maxAge: 24 * 60 * 60 * 1000
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
        const query1 = `SELECT * FROM trips WHERE(driver_id='${driver.id}' AND status='unconfirmed')`
        connection.query(query1, function (err, requests) {
            if (err) throw err;
            const query2 = `SELECT * FROM trips WHERE(driver_id='${driver.id}' AND (status='confirmed' OR status='transit'))`
            connection.query(query2, function (err, upcoming) {
                if (err) throw err;
                res.render('driver', {
                    title: "Home",
                    logged_in: true,
                    requests: requests,
                    upcoming: upcoming
                });
            });
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/driver', function (req, res) {
    const query = `UPDATE trips SET status = '${req.body.trip_status}' WHERE trip_id=${req.body.trip_id}`
    connection.query(query, function (err, results) {
        if (err) throw err;
        res.redirect('/driver');
    });
})

app.get('/hirer', function (req, res) {
    if (req.session.user) {
        let hirer = req.session.user;
        const query1 = `SELECT * FROM drivers WHERE(zip='${hirer.zip}' OR city='${hirer.state}' OR state='${hirer.city}')`
        connection.query(query1, function (err, nearby) {
            if (err) throw err;
            const query2 = `SELECT loads.load_id, destAddress, destZip, destCity, destState, status FROM trips, loads WHERE(hirer_id=${hirer.id} AND trips.load_id=loads.load_id)`
            connection.query(query2, function (err, booked) {
                if (err) throw err;
                res.render('hirer', {
                    title: "Home",
                    logged_in: true,
                    nearby: nearby,
                    booked: booked
                });
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
    let auction = req.body.auction;
    let load = {
        hirerid: req.session.user.id,
        weight: req.body.loadwt,
        type: req.body.loadtype
    }
    let trip = req.body;

    delete trip.loadwt;
    delete trip.loadtype;
    delete trip.auction;

    trip.pickuptime = trip.pickuptime.replace('T', ' ') + ':00';
    trip.status = "unconfirmed";
    if (auction) {
        trip.status = "bidding";
        let driver_id = -1; // dummy id for things being auctioned
        connection.query(`INSERT INTO loads VALUES(NULL, ?)`, [Object.values(load)], function (err, results) {
            if (err) throw err;
            else {
                connection.query(`SELECT LAST_INSERT_ID()`, function (err, results) {
                    if (err) throw err;
                    else {
                        let load_id = results[0]['LAST_INSERT_ID()'];
                        connection.query(`INSERT INTO trips VALUES(NULL, ?, ${driver_id}, ${load_id})`, [Object.values(trip)], function (err, results) {
                            if (err) throw err;
                            else {
                                connection.query(`SELECT LAST_INSERT_ID()`, function (err, results) {
                                    if (err) throw err;
                                    else {
                                        let trip_id = results[0]['LAST_INSERT_ID()'];
                                        connection.query(`INSERT INTO bids VALUES(${trip_id}, ${driver_id}, 0)`, [Object.values(trip)], function (err, results) {
                                            if (err) throw err;
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
    else {
        connection.query(`SELECT zip FROM hirers WHERE id = ${load.hirerid}`, function (err, results) {
            if (err) throw err;
            let zip = results[0]['zip'];

            connection.query(`SELECT * FROM drivers WHERE(capacity >= ${load.weight} AND loadtype = '${load.type}' AND CAST(zip AS UNSIGNED) BETWEEN ${zip - 2} AND ${zip + 2})`, function (err, results) {
                if (err) throw err;
                let driver_id = results[0]['id'];

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
                        });
                    }
                });
            });
        });
    }
    res.redirect('/hirer');
});

app.get('/auction', function (req, res) {
    if (req.session.user && req.session.user.type == "driver") {
        let driver = req.session.user;
        const query = `SELECT trips.trip_id, destAddress, destCity, destState, destZip, pickuptime, highestbid FROM trips, bids WHERE(trips.trip_id = bids.trip_id AND status='bidding')`
        connection.query(query, function (err, auctions) {
            if (err) throw err;
            res.render('auction', {
                title: "Auction",
                logged_in: true,
                auctions: auctions
            });
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/auction', function (req, res) {
    console.log(req.body.previous, req.body.amount)
    if (parseInt(req.body.previous) > parseInt(req.body.amount)) {
        const query = `UPDATE bids SET highestbid = '${req.body.amount}', driver_id = '${req.session.user.id}' WHERE trip_id=${req.body.trip_id}`
        connection.query(query, function (err, results) {
            if (err) throw err;
            res.redirect('/auction');
        });
    }
    else {
        res.redirect('/auction');
    }
});

//About and Contact

app.get('/about', function (req, res) {
    res.render('about', {
        title: "About",
        logged_in: session.user ? true : false
    });
});

app.get('/contact', function (req, res) {
    res.render('contact', {
        title: "Contact Us",
        logged_in: session.user ? true : false
    });
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});