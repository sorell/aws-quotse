const { hostname } = require('os');
const http = require('http');
const url = require('url');
const message = 'Hello World\n';
const port = 8080;

const querystring = require('querystring');

var AWS = require('aws-sdk');

AWS.config.update({region: "eu-west-1"});

var dynamodb = new AWS.DynamoDB();
//var dynamodb = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});


const util = require('util');
const safePromisify = function (fun, methodsArray) {
  const suffix = 'Async';
    methodsArray.forEach(method => {
      fun[method + suffix] = util.promisify(fun[method]);
  });
}
safePromisify(dynamodb, ['getItem']);


function darnation(res, text) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  if (typeof text === "undefined") {
    res.end('Fail. Darnation!');
  }
  else {
    res.end(text);
  }
}


function getQuoteCountPromise() {
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    }
  };
  return dynamodb.getItemAsync(params);
}


function getQuoteNrPromise(getIdx) {
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: getIdx.toString()}
    }
  };
  return dynamodb.getItemAsync(params);
}


function getRandomQuote(res) {
  getQuoteCountPromise()
  .then((result) => {
    // console.log('getRandomQuote THEN1', result);
    try {
      const itemCount = parseInt(result.Item.Value.N);
      if (itemCount < 1) {
        darnation(res, 'Database empty');
        return;
      }
      return getQuoteNrPromise(Math.floor(Math.random() * itemCount));
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Counters', err);
    darnation(res);
  })
  .then((result) => {
    try {
      // console.log('getRandomQuote THEN2', result);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"response_type":"in_channel","text":"' + result.Item.Quote.S.split('"').join('\\"') + '"}');
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Quotse', err);
    darnation(res);
  });
}


function scanQuotes(keyword, res) {
  const params = {
    TableName: 'Quotse',
    FilterExpression: 'contains (Quote, :keyword)',
    ProjectionExpression: 'Quote',
    ExpressionAttributeValues: {":keyword": {'S': keyword}}
  };

  dynamodb.scan(params, function(err, result) {
    if (err) {
      console.log("QUERY Error", err);
    } else {
      console.log("QUERY Success", result);
      console.log('got items:', result.Items.length);
      
      if (result.Items.length < 1) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end('{"response_type":"in_channel","text":"No match :("}');
        return;
      }

      const itemNr = Math.floor(Math.random() * result.Items.length);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"response_type":"in_channel","text":"' + result.Items[itemNr].Quote.S.split('"').join('\\"') + '"}');
    }
  });
}


function pushQuotes(res) {
  try {
    var fs = require('fs');
    const allLines = fs.readFileSync('quotes.txt', 'utf8');
    const lines = allLines.split('\n');
    var addedLines = 0;
    lines.forEach(function(line) {
      if (line.length > 1) {
        const params = {
          TableName: 'Quotse',
          Item: {
            'Idx': {N: addedLines.toString()},
            'Quote': {S: line}
          }
        };

        dynamodb.putItem(params, function(err, data) {
          if (err) {
            console.error('Write error', err);
          }
        });

        addedLines += 1;
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(addedLines.toString() + ' lines added');
  }
  catch (err) {
    console.error(err);
    darnation(res);
  }
}


function adminAction(text, res) {
  console.log('adminAction', text);

  const parts = text.split(' ');
  if (parts.length < 2) {
    console.log('adminAction parts.length =', parts.length.toString());
    darnation(res, 'Parameters missing');
    return;
  }

  if (parts[0] != '2T0uVdwJTd2hSSx9oa') {
    console.log('adminAction bad pass');
    darnation(res, 'Bad param');
    return;
  }

  if (parts[1] == 'pushQuotes') {
    pushQuotes(res);
  }
  else {
    console.log('adminAction unk cmd');
    darnation(res, 'Bad param');
  }
}


const server = http.createServer((req, res) => {
  // console.log(`Got ${req} ` + req.url + ' ')
  // for (var prop in req.headers) {
  //   if (req.headers.hasOwnProperty(prop)) { console.log(prop + ': ' + req.headers[prop]) }
  // }

  if (!req.headers.hasOwnProperty('user-agent')  ||  !req.headers['user-agent'].includes('Slackbot')  ||  !req.headers.hasOwnProperty('x-slack-signature')) {
    console.log('Request headers invalid');
    darnation(res, 'Pffffff....');
    return;
  }


  let rawData = '';
  req.on('data', (chunk) => { rawData += chunk; });
  req.on('end', () => {
    try {
      const parsedData = querystring.parse(rawData);
      const action = querystring.parse(url.parse(req.url)['query'])['action'];
      const text = parsedData['text'];
      console.log('ACTION', action);
      console.log('TEXT', text);

      if (action == 'getrandom') {
        //getQuoteCount(getQuoteNr, res);
        if (text.length < 1) {
          getRandomQuote(res);
        }
        else {
          scanQuotes(text, res);
        }
      }
      else if (action == 'add') {
        darnation(res, 'Not implemented yet');
      }
      else if (action == 'admin') {
        adminAction(text, res);
      }
    }
    catch (e) {
      console.error(e.message);
    }
  });

//  console.log('QUERY ');
//  console.log(require('querystring').parse(req.data));
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname()}:${port}/`);
});
