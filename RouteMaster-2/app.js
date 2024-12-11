// entrypoint for our app
// replace require with esm version of require for added functionality
require = require('esm')(module)
// normal export so node knows what the main file is
module.exports = require("./src/mainServer.js")
