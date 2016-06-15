// TODO:  Add - str.replace( /\s\s+/g, ' ' ) - - add regex to trim input line, double spaces and leading/trailing ones too...

//  Commands:
//  CREATE <War Size> <Opponent Name>
//       Sets the war size and opponent name for the message header.   
//  CALL <base #> <name>
//       Adds a Caller to the base, calls are added in order received, multiple calls on a base allowed.
//  REPORT <base #> <name> <stars 0,1,2,3> 
//       Use to report the results of an attack.  If 3 stars, remove the base, otherwise mark with stars.
//  REMOVE <base #> <name> 
//		 Use to remove a call from the list - the case would be for a user deciding not to do an attack.
//  LIST
//		 Shows the list without making changes	
//  EXAMPLE 
//       Sends a more detailed help message
//  HELP 
//       Sends this list as a message


var HTTPS = require('https');
var redis = require('redis');
var CRLF = String.fromCharCode(13) + String.fromCharCode(10);

var Database_List = "Mstr_Ls_SL";
var Database_Header ="Mstr_Hdr_SL";
var Database_StartTime = "Mstr_St_SL";
var warHeader = 'Spartan Lore vs. ';
var warRules = "Initial calls good til 8 hr mark, subsequent call 4 hr expiration.  First attack within 12 hrs of war start, TH8's need done by 18 hr mark." + CRLF;

var createPwd = "WAR";
var startTime = 0;

var prepDay = 23 * 60 * 60 * 1000;				// in seconds - 23 hours.
var ExpirationTime = 2 * 60 * 60 * 1000;

	
var botID = process.env.BOT_ID;
var botNAME = process.env.BOT_NAME;
var requestor;
var commands = ["CREATE","CALL","REPORT","REMOVE","EDIT","HELP","EXAMPLE", "LIST", "END"];
var unicodeStar = '\u2b50\ufe0f'; 
var unicodeDash = '\u2796';
var maxNameLength = 8;

function Base(num, callerlist, calltimelist, stars)
{
	this.num = num;
	this.callerlist = [callerlist];
	this.calltimelist = [calltimelist];
	this.stars = stars;
}

var BaseList = [];
var ListHeader = 'default';

// initialize list from redis
var dbclient = redis.createClient(process.env.REDISCLOUD_URL, {no_ready_check: true});

dbclient.exists(Database_List, function (err, reply) {
	if(reply != 1){
		//key doesn't exist
		console.log('Master_List Key did not exist...');
		dbclient.set(Database_List, JSON.stringify(BaseList));
	} else {
		dbclient.get(Database_List, function (err, reply){
			if(reply != null) {
				console.log('Read Master_List...');
				BaseList = JSON.parse(reply);
			} 
		});
	}
});

dbclient.exists(Database_Header, function (err, reply) {
	if(reply != 1){
		//key doesn't exist
		console.log('Master_Header Key did not exist...');
		dbclient.set(Database_Header, JSON.stringify(ListHeader));
	} else {
		dbclient.get(Database_Header, function (err, reply){
			if(reply != null) {
				console.log('Read Master_Header...');
				ListHeader = JSON.parse(reply);
			} 
		});
	}
});

dbclient.exists(Database_StartTime, function (err, reply) {
	if(reply != 1){
		//key doesn't exist
		console.log('Master_Header Key did not exist...');
		dbclient.set(Database_StartTime, JSON.stringify(Date.now()));
	} else {
		dbclient.get(Database_StartTime, function (err, reply){
			if(reply != null) {
				console.log('Read Master_StartTimer...');
				startTime = JSON.parse(reply);
			} 
		});
	}
});

function respond() {
	var request = JSON.parse(this.req.chunks[0]);
	requestor = request.name;
	console.log('***** RECEIVED ******');
	console.log(request);
	console.log('caller name: ' + requestor);
	var inputs = request.text.split(" ");
	var cmd = 0;
	
	if(inputs.length > 0) {
		for(; cmd < commands.length; cmd++){
			if(inputs[0].match(RegExp('^' + commands[cmd] + '$', 'i'))) break;
		}
	}
	else {
		console.log('Message was empty...');
		cmd = commands.length;  // last item is do-nothing
	}
	callerNameRegEx = RegExp(botNAME);
	if(request.name.match(callerNameRegEx)){
		console.log('do not respond to self');
		cmd = commands.length;  // last item is do-nothing
	} else {
	console.log('Parameters: ' + inputs);
	console.log('Parsed Command to be:' + cmd);		
	}

	switch(cmd){
		case 0:{
			console.log("handling CREATE (0)");
			var result = fCreateHandler(inputs);
			this.res.writeHead(200);
			if(result.success){
				postMessageList();
				} 
			else {
				postMessage(result.error);
				}
			this.res.end();
		} break;
		case 1:{
			console.log("handling CALL (1)");
			var result = fCallHandler(inputs);
			this.res.writeHead(200);
			if(result.success){
				postMessageList();
				} 
			else {
				postMessage(result.error);
				}
			this.res.end();
		} break;
		case 2:{
			console.log("handling REPORT (2)");
			var result = fReportHandler(inputs);
			this.res.writeHead(200);
			if(result.success){
				postMessageList();
				} 
			else {
				postMessage(result.error);
				}
			this.res.end();
		} break;
		case 3:{
			console.log("handling REMOVE (3)");
			var result = fRemoveHandler(inputs);
			this.res.writeHead(200);
			if(result.success){
				postMessageList();
				} 
			else {
				postMessage(result.error);
				}
			this.res.end();
		} break;
		case 4:{
			console.log("handling EDIT (4)");
		} break;
		case 5:{
			console.log("handling HELP (5)");
			helpText =  'CALL <map#> <name>' + CRLF +
						'REPORT <map#> <name> <stars as number>' + CRLF +
						'REMOVE <map#> <name>' + CRLF +
						'LIST - just show the calls again' + CRLF +
						'EXAMPLE - shows examples';
			postMessage(helpText);
		} break;
		case 6: {
			console.log("handling EXAMPLE (6)");
			exampleText =  'All examples are for the player Killer.' + CRLF +
						'To CALL a base will add the name to the end of the list for that base. ' + 
						'Calls are added to the base in the order received, more than one is allowed.  Example:' + CRLF +
						'CALL 5 Killer' + CRLF + CRLF +
						
						'The opposite of call is REMOVE, useful if you want to change to a different base.  Example:' + CRLF +
						'REMOVE 5 Killer' + CRLF + CRLF +
						
						'After attacking a base you need to REPORT the result.  ' +  
						'The fomat is the same as the others except a number is added to the end for the number of stars.  Example of Killer getting one star on base 5:' + CRLF +
						'REPORT 5 Killer 1' + CRLF + CRLF +
						
						'Reporting 0, 1 or 2 stars shows actual stars, 3 stars hides the line.   To unhide the line just report again with the correct number of stars.  Example:' + CRLF +
						'REPORT 5 Killer 2 (will show 2 stars)' + CRLF +
						'REPORT 5 Killer -1 (make base look un-hit)' + CRLF + CRLF +
						
						'Notes: DO NOT CUT and PASTE.  Names are limited at 8 letters. CAPS are ignored.';
			postMessage(exampleText);
		} break;
		case 7:{
			this.res.writeHead(200);
			postMessageList();
			this.res.end();
		} break;
		default:{
			console.log("Unhandled Message: ");
			var max = 20;
			if (request.text.length < max) max = request.text.length;
			console.log(request.text.substring(0,max));
			this.res.writeHead(200);
			this.res.end();
		}
	}
}

/******************************************************************************/
function fCreateHandler(inputs){
	var errorText = 'Unknown Error';
	if(inputs.length < 4){
		console.log('functCreateCaller:: not enough parameters (' + inputs.length +')');
		errorText = 'Error: Not enough parameters.' + CRLF +
					'Use CREATE (password) (Number of bases) (Opponent Name)' + CRLF +
					'Example CREATE pwd 20 LostPheonix';
		return {success: false, error: errorText};
	}
	
	pwd = inputs[1];
	warSize = inputs[2];
	oppName = inputs.splice(3,inputs.length-2).join(' ');
	if(!pwd.match(RegExp('^' + createPwd + '$','i'))){
		console.log('functCreateCaller:: invalid password ' + pwd);
		errorText = 'Error: War incorrect password' + CRLF +
					'Use CREATE (password) (Number of bases) (Opponent Name)' + CRLF +
					'Example CREATE pwd 20 LostPheonix';
		return {success: false, error: errorText};
	}
	
	if(!validateNumber(warSize,2)){
		console.log('functCreateCaller:: invalid war numeric (' + warSize + ')');
		errorText = 'Error: War size must be a number' + CRLF +
					'Use CREATE (password) (Number of bases) (Opponent Name)' + CRLF +
					'Example CREATE pwd 20 LostPheonix';
		return {success: false, error: errorText};
	}
	if(warSize > 50 || warSize < 10 || (warSize%5 != 0)){
		console.log('functCreateCaller:: invalid war size increment (' + warSize + ')');
		errorText = 'Error: War size must be multiple of 5, between 10 and 50' + CRLF +
					'Use CREATE (password) (Number of bases) (Opponent Name)' + CRLF +
					'Example CREATE pwd 20 LostPheonix';
		return {success: false, error: errorText};
	}
	// all inputs were good...
	BaseList.splice(0,BaseList.length);  // clear the existing array
	ListHeader = warHeader + ' ' + oppName + CRLF + warRules;
	for (i = 1; i <= warSize; i++) {
		BaseList.push(new Base(i, '', '', -1));
	}
	
	startTime = Date.now() + prepDay;
	console.log('fCreateHandler :: Push StartTime to DB' + JSON.stringify(startTime))  	
	dbclient.set(Database_StartTime, JSON.stringify(startTime));	
	
	console.log('fCreateHandler :: Push Header to DB' + JSON.stringify(ListHeader))  	
	dbclient.set(Database_Header, JSON.stringify(ListHeader));	
	
	console.log('fCreateHandler :: Push List to DB' + JSON.stringify(BaseList))  	
	dbclient.set(Database_List, JSON.stringify(BaseList));							
	return {success: true, error: "No Errors"};
}
	
/******************************************************************************/
function fCallHandler(inputs){
	var errorText = 'Unknown Error';
	if(inputs.length < 3){
		console.log('fCallHandler:: not enough parameters (' + inputs.length +')');
		errorText = 'Error: Not enough parameters.' + CRLF +
					'Use CALL (base #) (Your Name)' + CRLF +
					'Example CALL 5 ' + requestor;
		return {success: false, error: errorText};
	}
	baseNum = inputs[1];
	//caller = inputs.splice(2,inputs.length-2).join(' ');
	caller = inputs.splice(2).join(' ');
	if(!validateNumber(baseNum,2)){
		console.log('fCallHandler:: invalid base number (' + baseNum + ')');
		errorText = 'Error: Cannot find base number.' + CRLF +
					'Use CALL (base #) (Your Name).' + CRLF +
					'Example CALL 5 ' + requestor;
		return {success: false, error: errorText};
	}
	if(baseNum > BaseList.length || baseNum < 1){
		console.log('fCallHandler:: base out of range (' + baseNum + ')');
		errorText = 'Base must be between 1 and ' + BaseList.length + CRLF +
					'Use CALL (base #) (Your Name).' + CRLF +
					'Example CALL 5 ' + requestor;
		return {success: false, error: errorText};
		}
	if(caller.length > maxNameLength){
		caller = caller.substring(0, maxNameLength)
		}
		
	// passed all input checks...	
	for (i = 0; i < BaseList.length; i++) {
		if(BaseList[i].num == baseNum) {
			BaseList[i].callerlist.push(caller);
			BaseList[i].calltimelist.push(Date.now());
			break;
		}
	}
    console.log('fCallHandler :: Push to DB' + JSON.stringify(BaseList));
	dbclient.set(Database_List, JSON.stringify(BaseList));	
	return {success: true, error: "No Error"};
}

/******************************************************************************/
function fRemoveHandler(inputs){
	var errorText = 'Unknown Error';
	if(inputs.length < 3){
		console.log('fRemoveHandler:: not enough parameters (' + inputs.length +')');
		errorText = 'Error: Not enough parameters.' + CRLF +
					'Use REMOVE (base #) (Your Name)' + CRLF +
					'Example REMOVE 5 ' + requestor;
		return {success: false, error: errorText};
	}
	baseNum = inputs[1];
	caller = inputs.splice(2).join(' ');
	if(!validateNumber(baseNum,2)){
		console.log('fRemoveHandler:: invalid base number (' + baseNum + ')');
		errorText = 'Error: Cannot find base number.' + CRLF +
					'Use REMOVE (base #) (Your Name)' + CRLF +
					'Example REMOVE 5 ' + requestor;
		return {success: false, error: errorText};
	}
	if(baseNum > BaseList.length || baseNum < 1){
		console.log('fRemoveHandler:: base out of range (' + baseNum + ')');
		errorText = 'Error: Base must be between 1 and ' + BaseList.length + CRLF +
					'Use REMOVE (base #) (Your Name)' + CRLF +
					'Example REMOVE 5 ' + requestor;
		return {success: false, error: errorText};
	}
	console.log('Removing ' + caller + ' from base ' + baseNum);
	callerRegEx = regExpEscape(caller);
	callerRegEx = RegExp('^' + callerRegEx,'i');  // i = case independent
	console.log('fRemoveHandler::callerRegEx ' + callerRegEx);
	for (i = 0; i < BaseList.length; i++) {
		if(BaseList[i].num == baseNum) {
			for(j = 0; j < BaseList[i].callerlist.length; j++){
				if(BaseList[i].callerlist[j].match(callerRegEx)){
					console.log('fRemoveHandler::matchOn ' + BaseList[i].callerlist[j])
					BaseList[i].callerlist.splice(j,1);              
					BaseList[i].calltimelist.splice(j,1);              
				}
			}
			break;
		}
	}
	console.log('fRemoveHandler :: Push to DB' + JSON.stringify(BaseList))
	dbclient.set(Database_List, JSON.stringify(BaseList));
	return {success: true, error: "No Error"};
}

/******************************************************************************/
function fReportHandler(inputs){
	var errorText = 'Unknown Error';
	if(inputs.length < 4){
		errorText = 'Error: Not enough parameters.' + CRLF +
					'Use REPORT (base #) (Your Name) (stars).' + CRLF +
					'Example REPORT 5 ' + requestor + ' 0';
		return {success: false, error: errorText};
	}
	console.log('fReportHandler Parameters: ' + inputs);

	baseNum = inputs[1];
	stars = inputs.pop();
	caller = inputs.splice(2).join(' ');
	console.log('caller: ' + caller);
	inputs.push(caller);  //the splice popped the item off the array.
	
	if(!validateNumber(baseNum,2)){
		console.log('fReportHandler:: invalid base number (' + baseNum + ')');
		errorText = 'Error: Cannot find base number.' + CRLF +
					'Use REPORT (base #) (Your Name) (stars).' + CRLF +
					'Example REPORT 5 ' + requestor + ' 0';
		return {success: false, error: errorText};
	}
	if(baseNum > 50 || baseNum < 1){
		console.log('fReportHandler:: base out of range (' + baseNum + ')');
		errorText = 'Error: Base must be between 1 and ' + BaseList.length + CRLF +
					'Use REPORT (base #) (Your Name) (stars).' + CRLF +
					'Example REPORT 5 ' + requestor + ' 3';
		return {success: false, error: errorText};
	}
	if(!validateNumber(stars,1)){
		console.log('fReportHandler:: invalid stars number (' + stars + ')');
		errorText = 'Error: Stars must be between 0 and 3, use a number not symbols' + CRLF +
					'Use REPORT (base #) (Your Name) (stars).' + CRLF +
					'Example REPORT 5 ' + requestor + ' 1';
		return {success: false, error: errorText};
	}
	if(stars > 3 || stars < -1){
		console.log('fReportHandler:: stars out of range (' + stars + ')');
		errorText = 'Error: Stars must be -1, 0, 1, 2, 3.' + CRLF +
					'Use REPORT (base #) (Your Name) (stars).' + CRLF +
					'Example REPORT 5 ' + requestor + ' 2' + CRLF +
					'Use -1 stars to set base to not attacked yet';
		return {success: false, error: errorText};
	}
	console.log('Removing ' + caller + ' from base ' + baseNum);
	
	callerRegEx = regExpEscape(caller);
	callerRegEx = RegExp('^' + callerRegEx,'i');  // i = case independent
	for (i = 0; i < BaseList.length; i++) {
		if(BaseList[i].num == baseNum) {
			for(j = 0; j < BaseList[i].callerlist.length; j++){
				if(BaseList[i].callerlist[j].match(callerRegEx)){
					BaseList[i].callerlist.splice(j,1);              
					BaseList[i].calltimelist.splice(j,1);              
				}
			}
			break;
		}
	}    
	
	console.log('logging stars ' + stars + 'on base ' +baseNum);
	for (i = 0; i < BaseList.length; i++) {
		if(BaseList[i].num == baseNum) {
			BaseList[i].stars = stars;
			break;
		}
	}
    console.log('fReportHandler :: Push to DB' + JSON.stringify(BaseList))
	dbclient.set(Database_List, JSON.stringify(BaseList));
	return {success: true, error: "No Error"};
}

/******************************************************************************/
function postMessage(botResponse) {
  var options, body, botReq;
  options = {
    hostname: 'api.groupme.com',
    path: '/v3/bots/post',
    method: 'POST'
  };

  body = {
    "bot_id" : botID,
    "text" : botResponse
  };

  console.log('sending ' + botResponse + ' to ' + botID);

  botReq = HTTPS.request(options, function(res) {
      if(res.statusCode == 202) {
        //neat
      } else {
        console.log('rejecting bad status code ' + res.statusCode);
      }
  });

  botReq.on('error', function(err) {
    console.log('error posting message '  + JSON.stringify(err));
  });
  botReq.on('timeout', function(err) {
    console.log('timeout posting message '  + JSON.stringify(err));
  });
  botReq.end(JSON.stringify(body));
}

/******************************************************************************/
function postMessageList() {
  var botResponse, options, body, botReq;

  botResponse = ListHeader;
  var warStartDelta  = new Date(Date.now() - startTime);
  console.log('warStartDelta: ' + warStartDelta);
  for (i = 0; i < BaseList.length; i++){
	  if(BaseList[i].stars < 3){
		  starString = getStars(BaseList[i].stars);
		  var calledDelta = new Date(Date.now() - BaseList[i].calltimelist[1]); // TODO fix hack for empty element [0]

		  var expired = '';
		  if('undefined' !== typeof BaseList[i].calltimelist[1])
		  {
			  console.log('elasped time ' + (i+1) + ': ' + formatTime(ElaspedTime(startTime, BaseList[i].calltimelist[1])));
			  var et = ElaspedTime(startTime, BaseList[i].calltimelist[1]);
			  if( et > ExpirationTime)
			  {
				  expired = formatTime(et);
		  	  }
		  }
		  var callerTmpStr = BaseList[i].callerlist.join(', ');    // TODO fix hack for empty element [0]
		  callerTmpStr = callerTmpStr.replace(RegExp('^, '),'');   
		  botResponse += BaseList[i].num + ". " + starString + expired + " " + callerTmpStr + CRLF;

	  }
  }
	botResponse += 'Updated by: ' + requestor + ' ' + CRLF + 
					'Enter HELP for more instructions';
  options = {
    hostname: 'api.groupme.com',
    path: '/v3/bots/post',
    method: 'POST'
  };

  body = {
    "bot_id" : botID,
    "text" : botResponse
  };

  console.log('sending (' + botID + ')'+ CRLF + botResponse);

  botReq = HTTPS.request(options, function(res) {
      if(res.statusCode == 202) {
        //neat
      } else {
        console.log('rejecting bad status code ' + res.statusCode);
      }
  });

  botReq.on('error', function(err) {
    console.log('error posting message '  + JSON.stringify(err));
  });
  botReq.on('timeout', function(err) {
    console.log('timeout posting message '  + JSON.stringify(err));
  });
  botReq.end(JSON.stringify(body));
}
/******************************************************************************/
function getStars (starcount){
	if (starcount == -1){
		return ('');
	}
	if (starcount == 0) {
		return (unicodeDash + unicodeDash + unicodeDash);
	}
	if (starcount == 1) {
		return (unicodeStar + unicodeDash + unicodeDash);
	}
	if (starcount == 2) {
		return (unicodeStar + unicodeStar + unicodeDash);
	}
	return ('');
}
/******************************************************************************/
function validateNumber(input,digits){
	digits += 1;
	pattern = RegExp('^[0-9-]{1,' + digits + '}');
	return input.match(pattern);
}
/******************************************************************************/
function regExpEscape(literal_string) {
    return literal_string.replace(/[-[\]{}()*+!<=:?.\/\\^$|#,]/g, '\\$&');
}

/******************************************************************************/
function formatTime2(timeInteger) {
	console.log('seconds as float' + timeInteger / 1000);
	var seconds = Math.trunc(timeInteger / 1000);
	var hours = Math.trunc(seconds / (60 * 60));
	var minutes = Math.trunc((seconds/60) % 60);
	if (minutes < 10) minutes = '0' + minutes;
	return hours + ':' + minutes;
}
/******************************************************************************/
function formatTime(timeInteger) {
	var d = new Date(timeInteger);
	var hours = d.getHours();
	var minutes = d.getMinutes();
	if (minutes < 10) minutes = '0' + minutes;
	return hours + ':' + minutes;
}
/******************************************************************************/
function ElaspedTime(start_T, call_T) {
	var timeElasped = new Date();
	if(call_T.valueOf() < start_T.valueOf()){
		//called before war start
		if(Date.now() > start_T.valueOf()){
			//war has started
			timeElasped = Date.now() - start_T.valueOf();
		}
		else {
			timeElasped = 0;
		}
	}
		else {
			//called after war start
			timeElasped = Date.now() - call_T.valueOf();
		}
	return timeElasped;
}

/******************************************************************************/
exports.respond = respond;
/******************************************************************************/
