## How to configure - (I think)

1. Clone the repo
2. cd into the directory and run 'npm install' (should install all the dependencies)
3. Create .env file and create DB and sample table in MySQL
4. run 'node index.js'

## SQL Statements - 
create database vroom;
use vroom
CREATE TABLE drivers(
	driver_id INT NOT NULL,
	name VARCHAR(40) NOT NULL,
	location VARCHAR(40),
	PRIMARY KEY(driver_id)
);

INSERT INTO drivers VALUES(1234, "John Doe", "Chennai");
INSERT INTO drivers VALUES(9876, "Jane Smith", "Delhi");

## .env File - 
MYSQL_HOST=localhost
MYSQL_USER=username
MYSQL_PASSWORD=password
MYSQL_DB=vroom
