//var http, director, cool, bot, router, server, port;
var http, director, bot, router, server, port;

http        = require('http');
director    = require('director');
redis 		= require('redis');
bot         = require('./bot.js');


router = new director.http.Router({
  '/' : {
    post: bot.respond,
    get: ping
  }
});

server = http.createServer(function (req, res) {
  req.chunks = [];
  req.on('data', function (chunk) {
    req.chunks.push(chunk.toString());
  });

  router.dispatch(req, res, function(err) {
    res.writeHead(err.status, {"Content-Type": "text/plain"});
    res.end(err.message);
  });
});

port = Number(process.env.PORT || 5000);
server.listen(port);

function ping() {
  this.res.writeHead(200);
  this.res.end("Checking Ping - sl-caller.app.");
}