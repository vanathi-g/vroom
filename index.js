require("dotenv").config();

const { SSL_OP_EPHEMERAL_RSA } = require("constants");
const express = require('express')
const session = require('express-session');
const { request } = require("http");
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
        logged_in: session.user ? true : false,
        type: (req.session.user) ? req.session.user.type : "none"
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
            type: (req.session.user) ? req.session.user.type : "none",
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
                type: (req.session.user) ? req.session.user.type : "none"
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
            type: (req.session.user) ? req.session.user.type : "none"
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
            type: (req.session.user) ? req.session.user.type : "none"
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

function groupLoads(results) {
    if (results.length == 0)
        return results;
    let grouped = {};
    let prev = results[0].trip_id;
    let loads = [];
    results.forEach(result => {
        if (result.trip_id !== prev) {
            grouped[prev] = loads;
            loads = [];
            prev = result.trip_id;
        }
        let load = result;
        delete result.trip_id;
        loads.push(load);
    });
    grouped[prev] = loads;
    return grouped;
}

app.get('/driver', function (req, res) {
    if (req.session.user) {
        let driver = req.session.user;
        const query1 = `SELECT * FROM trips, loads WHERE driver_id = '${driver.id}' AND status='unconfirmed' AND trips.trip_id = loads.trip_id ORDER BY trips.trip_id;`
        connection.query(query1, function (err, requests) {
            if (err) throw err;
            const query2 = `SELECT * FROM trips, loads WHERE driver_id = '${driver.id}' AND (status='confirmed' OR status='transit') AND trips.trip_id = loads.trip_id ORDER BY trips.trip_id;`
            connection.query(query2, function (err, upcoming) {
                if (err) throw err;
                res.render('driver', {
                    title: "Home",
                    logged_in: true,
                    requests: groupLoads(requests),
                    upcoming: groupLoads(upcoming),
                    type: (req.session.user) ? req.session.user.type : "none"
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
            const query2 = `SELECT loads.load_id, destAddress, destZip, destCity, destState, status FROM trips, loads WHERE(hirer_id=${hirer.id} AND trips.trip_id=loads.trip_id)`
            connection.query(query2, function (err, booked) {
                if (err) throw err;
                const query3 = `SELECT loads.trip_id, destAddress, destCity, destState, destZip, pickuptime, highestbid FROM loads, bids, trips WHERE(trips.trip_id = bids.trip_id AND loads.trip_id = trips.trip_id AND status='bidding')`
                connection.query(query3, function (err, auctions) {
                    if (err) throw err;
                    res.render('hirer', {
                        title: "Home",
                        logged_in: true,
                        nearby: nearby,
                        booked: booked,
                        auctions: auctions,
                        type: (req.session.user) ? req.session.user.type : "none"
                    });

                });
            });
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/hirer', function (req, res) {
    const query1 = `SELECT driver_id FROM bids WHERE trip_id=${req.body.trip_id}`
    connection.query(query1, function (err, results) {
        const driver_id = results[0]['driver_id'];
        const query2 = `UPDATE trips SET status = 'unconfirmed', driver_id = ${driver_id} WHERE trip_id=${req.body.trip_id}`
        connection.query(query2, function (err, results) {
            if (err) throw err;
            res.redirect('/hirer');
        });

    });

})

// Booking page for Hirers

app.get('/book', function (req, res) {
    if (req.session.user) {
        res.render('book', {
            title: "Book Now!",
            logged_in: true,
            type: (req.session.user) ? req.session.user.type : "none"
        });
    } else {
        res.redirect('/login');
    }
});



app.post('/book', function (req, res) {
    let auction = req.body.auction;
    let hirerid = req.session.user.id;
    let load = req.body;
    delete load.auction;

    load.pickuptime = load.pickuptime.replace('T', ' ') + ':00';

    if (auction) {
        connection.query(`INSERT INTO trips VALUES(NULL, 'bidding', -1)`, function (err, results) {
            if (err) throw err;

            connection.query(`SELECT LAST_INSERT_ID()`, function (err, results) {
                if (err) throw err;
                let trip_id = results[0]['LAST_INSERT_ID()'];

                const query1 = `INSERT INTO loads VALUES(NULL, ?, ${hirerid}, ${trip_id})`;
                connection.query(query1, [Object.values(load)], function (err, results) {
                    if (err) throw err;
                    const query2 = `INSERT INTO bids VALUES(${trip_id}, -1, 9999)`;
                    connection.query(query2, function (err, results) {
                        if (err) throw err;
                    });

                });
            });
        });
    }
    else {
        const query1 = `SELECT zip FROM hirers WHERE id = ${hirerid}`;
        connection.query(query1, function (err, results) {
            if (err) throw err;
            let zip = results[0]['zip'];

            const query2 = `SELECT trip_id from drivers d, trips t WHERE(capacity > ((SELECT SUM(weight) FROM loads, trips WHERE (trips.trip_id = loads.trip_id AND trips.status='unconfirmed' and driver_id = d.id) GROUP BY driver_id) + ${load.loadwt}) AND loadtype = '${load.loadtype}' AND CAST(zip AS UNSIGNED) BETWEEN ${zip - 2} AND ${zip + 2}) AND t.driver_id = d.id`
            connection.query(query2, function (err, results) {
                if (err) throw err;

                // If no trip already exists where this load can be added

                if (results.length == 0) {

                    const query3 = `SELECT id FROM drivers, trips WHERE(capacity >= ${load.loadwt} AND loadtype = '${load.loadtype}' AND CAST(zip AS UNSIGNED) BETWEEN ${zip - 2} AND ${zip + 2})`
                    connection.query(query3, function (err, results) {
                        if (err) throw err;

                        let driver_id = results[0]['id'];
                        connection.query(`INSERT INTO trips VALUES(NULL, 'unconfirmed', ${driver_id})`, function (err, results) {
                            if (err) throw err;

                            connection.query(`SELECT LAST_INSERT_ID()`, function (err, results) {
                                if (err) throw err;
                                let trip_id = results[0]['LAST_INSERT_ID()'];

                                const query4 = `INSERT INTO loads VALUES(NULL, ?, ${hirerid}, ${trip_id})`;
                                connection.query(query4, [Object.values(load)], function (err, results) {
                                    if (err) throw err;
                                });
                            });
                        });
                    });
                } else {

                    // Trip sharing - add this load also to the existing trip

                    let trip_id = results[0]['trip_id'];
                    const query3 = `INSERT INTO loads VALUES(NULL, ?, ${hirerid}, ${trip_id})`;
                    connection.query(query3, [Object.values(load)], function (err, results) {
                        if (err) throw err;
                    })
                }
            });
        });
    }
    res.redirect('/hirer');
});

app.get('/auction', function (req, res) {
    if (req.session.user && req.session.user.type == "driver") {
        let driver = req.session.user;
        const query = `SELECT trips.trip_id, destAddress, destCity, destState, destZip, pickuptime, highestbid FROM trips, bids, loads WHERE(trips.trip_id = bids.trip_id AND loads.trip_id = trips.trip_id AND status='bidding')`
        connection.query(query, function (err, auctions) {
            if (err) throw err;
            res.render('auction', {
                title: "Auction",
                logged_in: true,
                auctions: auctions,
                type: (req.session.user) ? req.session.user.type : "none"
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
        logged_in: session.user ? true : false,
        type: (req.session.user) ? req.session.user.type : "none"
    });
});

app.get('/contact', function (req, res) {
    res.render('contact', {
        title: "Contact Us",
        logged_in: session.user ? true : false,
        type: (req.session.user) ? req.session.user.type : "none"
    });
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});