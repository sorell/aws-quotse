const { hostname } = require('os');
const http = require('http');
const url = require('url');
const message = 'Hello World\n';
const port = 8080;

const querystring = require('querystring');

var AWS = require('aws-sdk');

AWS.config.update({region: 'eu-west-1'});

var dynamodb = new AWS.DynamoDB();
var fs = require('fs');
//var dynamodb = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});


const util = require('util');
const safePromisify = function (fun, methodsArray) {
  const suffix = 'Async';
    methodsArray.forEach(method => {
      fun[method + suffix] = util.promisify(fun[method]);
  });
}
safePromisify(dynamodb, ['getItem', 'putItem', 'updateItem', 'deleteItem']);


function darnation(httpRes, text) {
  httpRes.statusCode = 200;
  httpRes.setHeader('Content-Type', 'text/plain');
  if (typeof text === 'undefined') {
    httpRes.end('Fail. Darnation!');
  }
  else {
    httpRes.end(text);
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


function incQuoteCountPromise(counterCurrValue)
{
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    },
    ExpressionAttributeNames: {
      '#V': 'Value'
    },
    ExpressionAttributeValues: {
      ':nv': {N: (counterCurrValue+1).toString()},
      ':cv': {N: (counterCurrValue).toString()}
    },
    ConditionExpression: '#V = :cv',
    UpdateExpression: 'SET #V = :nv',
    ReturnValues: 'UPDATED_OLD'
  };
  return dynamodb.updateItemAsync(params);
}


function decQuoteCountPromise(counterCurrValue)
{
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    },
    ExpressionAttributeNames: {
      '#V': 'Value'
    },
    ExpressionAttributeValues: {
      ':nv': {N: (counterCurrValue-1).toString()},
      ':cv': {N: (counterCurrValue).toString()}
    },
    ConditionExpression: '#V = :cv',
    UpdateExpression: 'SET #V = :nv',
    ReturnValues: 'UPDATED_NEW'
  };
  return dynamodb.updateItemAsync(params);
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


function deleteQuoteNrPromise(deleteIdx) {
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: deleteIdx.toString()}
    },
    ReturnValues: 'ALL_OLD'
  };
  // console.log('DELETE', params);
  return dynamodb.deleteItemAsync(params);
}


function getRandomQuote(httpRes) {
  getQuoteCountPromise()
  .then((result) => {
    // console.log('getRandomQuote THEN1', result);
    try {
      const quoteCount = parseInt(result.Item.Value.N);
      if (quoteCount < 1) {
        darnation(httpRes, 'Database empty');
        return;
      }
      return getQuoteNrPromise(Math.floor(Math.random() * quoteCount));
    }
    catch (err) {
      console.error(err);
      darnation(httpRes);
    }
  }, (err) => {
    console.error('GET Counters', err);
    darnation(httpRes);
  })
  .then((result) => {
    try {
      // console.log('getRandomQuote THEN2', result);
      httpRes.statusCode = 200;
      httpRes.setHeader('Content-Type', 'application/json');
      httpRes.end('{"response_type":"in_channel","text":"' + result.Item.Quote.S.split('"').join('\\"') + '"}');
    }
    catch (err) {
      console.error(err);
      darnation(httpRes);
    }
  }, (err) => {
    console.error('GET Quotse', err);
    darnation(httpRes);
  });
}


function scanQuotes(keyword, httpRes) {
  const params = {
    TableName: 'Quotse',
    FilterExpression: 'contains (ScanText, :keyword)',
    ProjectionExpression: 'Quote',
    ExpressionAttributeValues: {':keyword': {'S': keyword.toLowerCase()}}
  };

  dynamodb.scan(params, function(err, result) {
    if (err) {
      console.log('QUERY Error', err);
    } else {
      // console.log('QUERY Success', result);
      // console.log('got items:', result.Items.length);
      
      if (result.Items.length < 1) {
        httpRes.statusCode = 200;
        httpRes.setHeader('Content-Type', 'application/json');
        httpRes.end('{"response_type":"in_channel","text":"No match :("}');
        return;
      }

      const itemNr = Math.floor(Math.random() * result.Items.length);
      httpRes.statusCode = 200;
      httpRes.setHeader('Content-Type', 'application/json');
      httpRes.end('{"response_type":"in_channel","text":"' + result.Items[itemNr].Quote.S.split('"').join('\\"') + '"}');
      console.log(result.Items[itemNr]);
    }
  });
}


function addQuote(line, httpRes) {
  getQuoteCountPromise()
  .then((result) => {
    // console.log('getRandomQuote THEN1', result);
    try {
      const quoteCount = parseInt(result.Item.Value.N);
      return incQuoteCountPromise(quoteCount);
    }
    catch (err) {
      console.error(err);
      darnation(httpRes);
    }
  }, (err) => {
    console.error('GET Counter', err);
    darnation(httpRes);
  })
  .then((result) => {
    // console.log('incRandomQuote THEN1', result);
    const params = {
      TableName: 'Quotse',
      Item: {
        'Idx': {N: result.Attributes.Value.N},
        'Quote': {S: line},
        'ScanText': {S: line.toLowerCase()}
      }
    };

    return dynamodb.putItemAsync(params);
  }, (err) => {
    console.error('INC Counter', err);
    darnation(httpRes);
  })
  .then((result) => {
    httpRes.statusCode = 200;
    httpRes.setHeader('Content-Type', 'application/json');
    httpRes.end('{"response_type":"in_channel","text":"It is done"}');
  }, (err) => {
    console.error('PUT new', err);
    darnation(httpRes);
  });
}


function deleteLastQuote(httpRes)
{
  getQuoteCountPromise()
  .then((result) => {
    // console.log('deleteLastQuote THEN', result);
    try {
      const quoteCount = parseInt(result.Item.Value.N);
      if (quoteCount < 1) {
        darnation(httpRes, 'Database empty');
        return;
      }
      return decQuoteCountPromise(quoteCount);
    }
    catch (err) {
      console.error(err);
      darnation(httpRes);
    }
  }, (err) => {
    console.error('GET Counter', err);
    darnation(httpRes);
  })
  .then((result) => {
    // console.log('DEC THEN', result);
    try {
      const itemIdx = parseInt(result.Attributes.Value.N);
      return deleteQuoteNrPromise(itemIdx);
    } catch (err) {
      console.error('DELETE THEN', err);
    }
  }, (err) => {
    console.error('DEC Counter', err);
    darnation(httpRes);
  })
  .then((result) => {
    // console.log('DELETE Quote', result);
    try {
      httpRes.statusCode = 200;
      httpRes.setHeader('Content-Type', 'text/plain');
      httpRes.end('Quote removed: ' + result.Attributes.Quote.S.split('"').join('\\"'));
    } catch (err) {
      console.error('DELETE Quote', err);
    }
  }, (err) => {
    console.error('DELETE Quote', err);
  });
}


function pushQuotes(httpRes) {
  try {
    const allLines = fs.readFileSync('quotes.txt', 'utf8');
    const lines = allLines.split('\n');
    var addedLines = 0;
    lines.forEach(function(line) {
      if (line.length > 1) {
        const params = {
          TableName: 'Quotse',
          Item: {
            'Idx': {N: addedLines.toString()},
            'Quote': {S: line},
            'ScanText': {S: line.toLowerCase()}
          }
        };

        dynamodb.putItem(params, function(err, data) {
          if (err) {
            console.error('Quotse write error', err);
          }
        });

        addedLines += 1;
      }
    });

    const params = {
      TableName: 'Counters',
      Key: {
        'Name' : {S: 'Quotes'}
      },
      ExpressionAttributeNames: {
        '#V': 'Value'
      },
      ExpressionAttributeValues: {
        ':v': {N: addedLines.toString()}
      },
      UpdateExpression: 'SET #V = :v'
    };

    dynamodb.updateItem(params, function(err, data) {
      if (err) {
        console.error('Counters write error', err);
      }
    });

    httpRes.statusCode = 200;
    httpRes.setHeader('Content-Type', 'text/plain');
    httpRes.end(addedLines.toString() + ' lines added');
  }
  catch (err) {
    console.error(err);
    darnation(httpRes);
  }
}


function pullQuoteNrPromise(funcData) {
  // console.log(pullQuoteNrPromise, funcData.idx, '/', funcData.count);
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: funcData.idx.toString()}
    }
  };
  return new Promise((resolve, reject) => {
    dynamodb.getItemAsync(params).then(function(result) {
      funcData.db = result;
      resolve(funcData);
    }).catch(function (err) {
      reject(err);
    });
  });
}


function writePulledQuote(result) {
  var fileHandle = result.fh;
  if (result.idx >= result.count) {
    console.log('Pulled', result.idx, 'quotes to', result.fn);
    fileHandle.end();
    httpRes = result.http;
    httpRes.statusCode = 200;
    httpRes.setHeader('Content-Type', 'text/plain');
    httpRes.end(result.idx.toString() + ' lines pulled to ' + result.fn);
    return null;
  }

  // console.log(result);
  fileHandle.write(result.db.Item.Quote.S + '\n');
  const quoteIdx = parseInt(result.db.Item.Idx.N);
  // console.log(quoteIdx, result.db.Item.Quote.S);
  result.idx += 1;
  return pullQuoteNrPromise(result).then(writePulledQuote);
};


function pullQuotes(httpRes, fileName) {
  var pulled = 0;

  try {
    var fileHandle = fs.createWriteStream(fileName, {flags: 'w'});

    getQuoteCountPromise().then((result) => {
      // console.log('pull CNT', result);
      const quoteCnt = parseInt(result.Item.Value.N);
      if (quoteCnt < 1) {
        darnation(httpRes, 'Database empty');
        return;
      }

      pullQuoteNrPromise({http: httpRes, fh: fileHandle, fn: fileName, idx: 0, count: quoteCnt}).then(writePulledQuote);
    }, (err) => {
      console.error('pullQuotes ERROR', err);
      darnation(httpRes);
    });
  }
  catch (err) {
    console.error('pull CONV ERROR', err);
    darnation(httpRes);
    return;
  }
}


function adminAction(text, httpRes) {
  console.log('adminAction', text);

  const parts = text.split(' ');
  if (parts.length < 2) {
    console.log('adminAction parts.length =', parts.length.toString());
    darnation(httpRes, 'Parameters missing');
    return;
  }

  var pass = '';
  try {
    pass = fs.readFileSync('pass.txt', 'utf-8').split('\n')[0];
  } catch (err) {
    console.warn('No PW file: admin actions disabled');
    darnation(httpRes, 'Not configured');
    return;
  }

  if (parts[0] != '2T0uVdwJTd2hSSx9oa') {
    console.log('adminAction bad pass');
    darnation(httpRes, 'Bad param');
    return;
  }

  if (parts[1] == 'pushQuotes') {
    pushQuotes(httpRes);
  }
  else if (parts[1] == 'pullQuotes') {
    if (parts.length < 3) {
      console.warn('pullQuotes missing filename');
      darnation(httpRes, 'Missing filename');
      return;
    }
    pullQuotes(httpRes, parts[2]);
  }
  else if (parts[1] == 'deleteLast') {
    deleteLastQuote(httpRes);
  }
  else {
    console.log('adminAction unk cmd');
    darnation(httpRes, 'Bad param');
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
        if (text.length < 1) {
          getRandomQuote(res);
        }
        else {
          scanQuotes(text, res);
        }
      }
      else if (action == 'add') {
        addQuote(text, res);
      }
      else if (action == 'admin') {
        adminAction(text, res);
      }
    }
    catch (err) {
      console.error(err);
    }
  });

//  console.log('QUERY ');
//  console.log(require('querystring').parse(req.data));
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname()}:${port}/`);
});
