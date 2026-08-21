// Loaded before any test file — points every test run at the isolated
// institute_os_test database (see .env.test), never the dev database in
// .env. The test suite's resetDb() helper truncates Staff/Student/Subject/
// etc. on every run; without this, tests silently wipe real dev data.
require("dotenv").config({ path: require("path").join(__dirname, ".env.test") });
