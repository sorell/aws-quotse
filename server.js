const { hostname } = require('os');
const http = require('http');
const url = require('url');
const message = 'Hello World\n';
const port = 8080;

const querystring = require('querystring');

var AWS = require("aws-sdk");

AWS.config.update({
  region: "eu-west-1",
//  endpoint: "arn:aws:dynamodb:eu-west-1:045172193889:table/Quotse"
});

var dynamodb = new AWS.DynamoDB();
//var dynamodb = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

const server = http.createServer((req, res) => {
  console.log(`Got ${req} ` + req.url + ' ')
  for (var prop in req.headers) {
    if (req.headers.hasOwnProperty(prop)) { console.log(prop + ': ' + req.headers[prop]) }
  }

  if (!req.headers.hasOwnProperty('user-agent')  ||  !req.headers['user-agent'].includes('Slackbot')  ||  !req.headers.hasOwnProperty('x-slack-signature')) {
    console.log('Request headers invalid');
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Pffffff....');
    return;
  }


  let rawData = '';
  req.on('data', (chunk) => { rawData += chunk; });
  req.on('end', () => {
    try {
      const parsedData = querystring.parse(rawData);
      const action = querystring.parse(url.parse(req.url)['query'])['action'];
      const text = parsedData['text'];
      console.log('ACTION ', action);
      console.log('TEXT', text);
      var itemCount = 0;

      if (text == 'init') {
        var params = {
          TableName: 'Counters',
          Item: {
            'Name' : {S: 'Quotes'},
            'Value' : {N: '0'}
          }
        };        

        dynamodb.putItem(params, function(err, data) {
          if (err) {
            console.log("Error", err);
          } else {
            console.log("Success", data);
          }
        });
      }

      if (action == 'getrandom') {
        dynamodb.describeTable({TableName: 'Quotse'}, function(err, data) {
          if (err) {
            console.log("ERROR DESCRIBE", err);
          } else {
            console.log("SUCCESS DESCRIBE", data.Items);
          }
        });
        //const description = await dynamodb.describeTable({TableName: 'Quotse'}).promise()


console.log('COUNT', itemCount);
        if (itemCount >= 0) {
          var params = {
            TableName: 'Quotse',
            KeyConditionExpression: "#id = :idnum",
            ExpressionAttributeNames:{"#id": "Idx"},
//            ExpressionAttributeValues: {":idnum": {'N': Math.floor(Math.random() * itemCount).toString()}}
            ExpressionAttributeValues: {":idnum": {'N': Math.floor(Math.random() * 4).toString()}}
          };
          console.log('QUERY');
          console.log(params);

          dynamodb.query(params, function(err, data) {
            if (err) {
              console.log("Error", err);
            } else {
              console.log("Success", data.Items);
              console.log(data);
              data.Items.forEach(function(element, index, array) {
                console.log(element.Idx.S + " (" + element.title.S + ")");
              });
            }
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end('{"response_type":"in_channel","text":"You say: ' + text + '"}');
          return;
        }
      }
    }
    catch (e) {
      console.error(e.message);
    }
  }).on('error', () => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Pffffff....');
  });

  console.log('QUERY ');
  console.log(require('querystring').parse(req.data));
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname()}:${port}/`);
});
