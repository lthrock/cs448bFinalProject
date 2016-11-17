
/* 
 * Necessary to keep track of how many polygons to draw between columns
 */
var numberOfMatchesPerColumn = [0, 0, 0];

/*
 * Necessary to highlight any selected polygon
 */
var highlightedPolygon = undefined;

/*
 * Keeps track of all nodes traversed in the detail view.
 *
 * Top node is used to determine the next nodes that will be viewed in the 
 * preview list on the right.
 */
var selectedNodeStack = [];

/*
 * Debugging method, just populates the detail view with a clicked node and 
 * its first child, grand child, and great grand child.
 */
function showNodeAndThreeDescendants(node) {
  var selectedNodeStack = [];
  var links = [];
  for (var i = 0; i < 4; i++) {
    selectedNodeStack.push(node);
    if (node.sourceLinks[0] == undefined) {
      break;
    }
    links.push(node.sourceLinks[0]);
    node = node.sourceLinks[0].target
  }

  populateDiffs(selectedNodeStack, links);
  populatePreviewList(selectedNodeStack[selectedNodeStack.length - 1]);
}

/*
 * Clears old path from detail view, and begins a new one given a selected node
 */
function createNewPathWithRoot(node) {
  selectedNodeStack = [node];
  updateDisplayedNodes();
}

/*
 * Pushes a new node on the node stack, and refreshes detail view to reflect 
 * changes.
 */
function extendPathWithNode(node) {
  selectedNodeStack.push(node);
  updateDisplayedNodes();

  // update highlighted polygon to reflect the shift left.
  if (highlightedPolygon == undefined || highlightedPolygon.parent == 0) {
    highlightedPolygon = undefined;
  } else {
    highlightedPolygon.child = highlightedPolygon.parent;
    highlightedPolygon.parent = highlightedPolygon.parent - 1;
  }
}

/*
 * Refreshes detail view, showing only the four top nodes in selectedNodeStack,
 * and updates preview list to show children of rightmost node. 
 */
function updateDisplayedNodes() {
  var nodes = [];
  var links = [];

  var totalNodes = selectedNodeStack.length
  var numToDisplay = Math.min(4, totalNodes); // only space for 4 in detail view
  var node = selectedNodeStack[totalNodes - numToDisplay];

  for (var i = 0; i < numToDisplay; i++) {
    nodes.push(node);

    // at each node but the last, get the link between the node and the 
    // next to be displayed.
    if (i < numToDisplay - 1) {
      var nextNode = selectedNodeStack[totalNodes - numToDisplay + i + 1];
      var found = false;
      // search through all links until the one that goes to the next 
      // node is found
      for (var j = 0; j < node.sourceLinks.length; j++) {
        var link = node.sourceLinks[j];
        if (link.target.uid == nextNode.uid) {
          found = true;
          links.push(link);
          break;
        }
      }
      if (!found) {
        console.log("ERROR: no matching target found.")
      }
      node = nextNode;
    }
  }
  populateDiffs(nodes, links);
  populatePreviewList(nodes[nodes.length - 1]);
}

/* 
 * Send Request to Server to get code for a node
 */
function sendCodeRequest(callback, uid, index) {
  var params = "";
  var datatype = "json";

  params = "?uid=" + uid

  var datatype = "json";
  $.ajax({
    type: 'GET',
    url: "http://localhost:8080/d3-evo?uid=" + uid + "&index=" + index,
    dataType: datatype, // data type of response
    success: callback
  });
}

/*
 * Make requests for all of the necessary code from server. 
 * Then, create HTML for the presented code in the detail view, and update 
 * the view.
 *
 * TODO: optimize to not rerequest old code that's already being shown.
 */
function populateDiffs(nodes, links) {
  // clear old html:
  $(".thumbnail-col.inside-full-height").html("");
  $(".name").html("");
  $(".author").html("");
  $(".code-container").html("");;

  var resultCount = 0;
  var results = [];

  var callback = function(response) {
    results[response.index] = response.code.split(/\n/);
    if (++resultCount == nodes.length) {
      numberOfMatchesPerColumn = createCodeHTML(nodes, links, results);
    }
    addCanvasHTML(numberOfMatchesPerColumn);
  }

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];

    sendCodeRequest(callback, node.uid, i);

    var author = node.uid.substring(0, node.uid.lastIndexOf("_"));
    $("#col-" + i + " .thumbnail-col.inside-full-height").html("<img src='assets/thumbnail1.png' class='code-thumbnail' alt='preview'>");
    $("#col-" + i + " .name").html(node.description);
    $("#col-" + i + " .author").html(author);
  }
}

/*
 * Responsible for creating the HTML to render the code in the detail view.
 */
function createCodeHTML(nodes, links, results) {
  // to keep track of how many matches there are between each gist
  var matchCounts = [0, 0, 0];

  var diffIDs = getDiffIDs(nodes, links, matchCounts);
  for (var codeIndex = 0; codeIndex < results.length; codeIndex++) {
    var newHTML = $("<span> </span>");

    for (var i = 0; i < results[codeIndex].length; i++) {
      var line = results[codeIndex][i];
      var lineNumber = i + 1;

      // add div boundary for the start of any matches
      newHTML.append(createBoundaryDivsForLine(diffIDs[codeIndex].starts, lineNumber));

      // add actual line of code
      var lineNumberHTML = $("<span class='line-number'>" + lineNumber + "</span>");
      var lineHTML = $("<div class='code-line'></div>");
      lineHTML.text("  " + line);
      lineHTML.prepend(lineNumberHTML);
      newHTML.append(lineHTML);

      // add div boundary for the end of any matches
      newHTML.append(createBoundaryDivsForLine(diffIDs[codeIndex].ends, lineNumber));
    }
    $("#col-" + codeIndex + " .code-container").html(newHTML);
  }
  return matchCounts;
}

/*
 * For a given line number in a single piece of code, creates the divs that
 * are used to mark the beginnings/ends of any matches, later to be used to
 * create red polygons connecting matches
 */
function createBoundaryDivsForLine(idMap, lineNumber) {
  var newHTML = "";
  if (idMap[lineNumber] != undefined) {
    var idList = idMap[lineNumber];
    for (var i = 0; i < idList.length; i++) {
      var boundaryHTML = "<div class='match-boundary' id='" + idList[i] + "'> </div>"
      newHTML += boundaryHTML;
    }
  }
  return newHTML;
}

/*
 * Given a link, its source and target, will construct a unique identifier
 * to be used in a set or as a key to a dictionary
 */
function getMatchIdentifier(link, source, target) {
  return link.source_start_line + "-" + link.source_end_line + ":" + link.target_start_line + "-" + link.target_end_line;
}

/* 
 * Due to a small bug somewhere in the MOSS pipeline, sometimes there are
 * duplicate links in our dataset. This is an easy fix to the issue. 
 *
 * If this no longer does anything, it means this was fixed in the pipeline,
 * and can be removed.
 */
function removeDuplicates(links) {
  uniqueLinkIdentifiers = new Set();
  uniqueLinks = [];
  for (var i = 0; i < links.length; i++) {
    link = links[i];
    var identifier = getMatchIdentifier(link, 0, 0); // source/target are always same, doesn't matter as long as they match
    if (!uniqueLinkIdentifiers.has(identifier)) {
      uniqueLinkIdentifiers.add(identifier);
      uniqueLinks.push(link);
    }
  }
  return uniqueLinks;
}

/*
 * Iterates through all links and creates all of the match IDs that will be
 * used later to place red polygon connectors. 
 * 
 * Returns these in a mapping from line number to an array of ids for all 
 * the divs that will need to be inserted on that line.
 */
function getDiffIDs(nodes, links, matchCounts) {
  // used to make sure id names are consistent between nodes
  var linkToIDMap = {}
  var diffIDs = [];

  for (var i = 0; i < links.length; i++) {
    links[i].links = removeDuplicates(links[i].links);
  }

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];

    var parentLinks = (i == 0 ? undefined : links[i - 1].links);
    var childLinks = (i == nodes.length - 1 ? undefined : links[i].links);

    // a mapping from line numbers to any div ids needed
    var matchInfo = { starts: {}, ends: {} };


    // parent links
    if (parentLinks != undefined) {
      var htmlIDPrefix = "cols-" + (i-1) + "-" + i + "-right-";
      for (var j = 0; j < parentLinks.length; j++) {
        var match = parentLinks[j];

        // we need line number and id number consistent with the id number
        // found in the parent's html id.
        var startLine = match.target_start_line;
        var endLine = match.target_end_line;
        var linkID = linkToIDMap[getMatchIdentifier(match, i-1, i)];

        if (matchInfo.starts[startLine] == undefined) {
          matchInfo.starts[startLine] = [];
        }
        if (matchInfo.ends[endLine] == undefined) {
          matchInfo.ends[endLine] = [];
        }

        matchInfo.starts[startLine].push(htmlIDPrefix + "start-match-" + linkID);
        matchInfo.ends[endLine].push(htmlIDPrefix + "end-match-" + linkID);
      }
    }

    // child links
    if (childLinks != undefined) {
      var htmlIDPrefix = "cols-" + i + "-" + (i+1) + "-left-";
      for (var j = 0; j < childLinks.length; j++) {
        var match = childLinks[j];

        // we need line number and id number consistent with the id number
        // found in the parent's html div id.
        var startLine = match.source_start_line;
        var endLine = match.source_end_line;

        // record what number this id is for when the child needs it!
        linkToIDMap[getMatchIdentifier(match, i, i+1)] = j;
        matchCounts[i]++;

        if (matchInfo.starts[startLine] == undefined) {
          matchInfo.starts[startLine] = [];
        }
        if (matchInfo.ends[endLine] == undefined) {
          matchInfo.ends[endLine] = [];
        }

        matchInfo.starts[startLine].push(htmlIDPrefix + "start-match-"+ j);
        matchInfo.ends[endLine].push(htmlIDPrefix + "end-match-"+ j);
      }
    }

    diffIDs.push(matchInfo);
  }
  return diffIDs;
}

/*
 * Clears the old canvas, and then adds back in all red polygon 
 * "match connectors".
 */
function addCanvasHTML(matchCounts) {
  var canvas = document.getElementById("html5Canvas");
  canvas.height = $("#diff-row").height();
  canvas.width = $("#diff-row").width();
  var context = canvas.getContext("2d");

  for (var i = 0; i < matchCounts.length; i++) {
    for (var j = 0; j < matchCounts[i]; j++) {
      drawConnectingPolygon(context, i, j);
    }
  }
}

/*
 * Draws a connecting polygon between two columns, with parentCol on the left 
 * and a child col on the right. Will use index to lookup divs and calculate 
 * vertical positioning. 
 */
function drawConnectingPolygon(context, parentCol, index) {
  var corners = getPolygonCorners(parentCol, index);

  if (corners.error) {
    return;
  }
  
  // draw polygon!
  if (highlightedPolygon != undefined && 
      parentCol == highlightedPolygon.parent && 
      index == highlightedPolygon.matchNumber) {
    context.fillStyle = 'rgba(174,25,22,0.50)';
  } else {
    context.fillStyle = 'rgba(255,45,33,0.33)';
  }
  context.beginPath();
  context.moveTo(corners.leftStart.x, corners.leftStart.y);
  context.lineTo(corners.rightStart.x, corners.rightStart.y);
  context.lineTo(corners.rightEnd.x, corners.rightEnd.y);
  context.lineTo(corners.leftEnd.x, corners.leftEnd.y);
  context.closePath();
  context.fill();
}

/*
 * Finds the coordinates of all 4 corners of a polygon, given the column to
 * the left's index, as well as which match number we're looking for.
 *
 * Returns corners in the form:
 * { 
 *   leftStart: { x, y }, 
 *   leftEnd: { x, y }, 
 *   rightStart: { x, y }, 
 *   rightEnd: { x, y }}
 */
function getPolygonCorners(parentCol, index) {
  // match starts and ends
  var prefix = "#cols-" + parentCol + "-" + (parentCol + 1) + "-";
  var parentStart = $(prefix + "left-start-match-" + index);
  var parentEnd = $(prefix + "left-end-match-" + index);
  var childStart = $(prefix + "right-start-match-" + index);
  var childEnd = $(prefix + "right-end-match-" + index);

  if (parentStart.length === 0 || parentEnd.length === 0 || childStart.length === 0 || childEnd.length === 0) {
    return {
      error: true
    }
  }

  // div edges aren't exactly where we want to start drawing our connecting polygons.
  var xCorrection1 = 25;
  var xCorrection2 = 18;

  // account for scroll
  var yCorrection = -1 * $("#diff-row").scrollTop();

  var leftX = xCorrection1 + parentStart.parent().parent().parent().position().left + parentStart.width();
  var leftStartY = yCorrection + parentStart.position().top + parentStart.height();
  var leftEndY = yCorrection + parentEnd.position().top + parentEnd.height();

  var rightX = xCorrection2 + childStart.parent().parent().parent().position().left;
  var rightStartY = yCorrection + childStart.position().top + childStart.height();
  var rightEndY = yCorrection + childEnd.position().top + childEnd.height();

  // result
  return {
    leftStart: { x: leftX, y: leftStartY },
    leftEnd: { x: leftX, y: leftEndY },
    rightStart: { x: rightX, y: rightStartY },
    rightEnd: { x: rightX, y: rightEndY }
  }
}

/*
 * Called on click on the detail view's diffs
 *
 * If the click's coordinates are inside a polygon, then update the 
 * "match inspector" view with the code from each side of the match
 */
function canvasClickFunction(event) {
  var containerOffset = $("#diff-row").offset();
  var x = event.pageX - containerOffset.left;
  var y = event.pageY - containerOffset.top;
  var selectedPolygon = searchForSelectedPolygon(x, y)

  if (selectedPolygon != undefined) {
    updateMatchInspector(selectedPolygon);
  }
}

function arrowClickFunction() {
  selectedNodeStack.pop();
  updateDisplayedNodes();

  // update highlighted polygon to reflect the shift left.
  var removedNodeIndex = Math.min(3, selectedNodeStack.length + 1);
  // if it was on the far right of the screen, the polygon gets cut off.
  if (highlightedPolygon == undefined || highlightedPolygon.child == removedNodeIndex) {
    highlightedPolygon = undefined;
  // otherwise, if there are still 4 nodes shown, shift the polygon right
  } else if (selectedNodeStack.length >= 4) {
    highlightedPolygon.parent = highlightedPolygon.child;
    highlightedPolygon.child = highlightedPolygon.child + 1;
  } 
}

/*
 * Iterates through all drawn polygons and checks to see if the given polygon
 * contains the point (x, y).
 *
 * If so, returns 
 *
 * { parent: parentCol, child: childCol, matchNumber: index }
 * 
 * This is all the needed information to search for the boundaries of the 
 * matching code on each side of the polygon, as well as to highlight the 
 * selected polygon.
 */
function searchForSelectedPolygon(x, y) {
  for (var i = 0; i < numberOfMatchesPerColumn.length; i++) {
    for (var j = 0; j < numberOfMatchesPerColumn[i]; j++) {
      var corners = getPolygonCorners(i, j);
      if (corners.error) {
        continue;
      }
      if (inPolygon(x, y, corners)) {
        var result = {};
        result.parent = i;
        result.child = i + 1;
        result.matchNumber = j;

        return result;
      }
    }
  }

  return undefined;
}

/*
 * Given an x and a y, check to see if it is contained within the polygon
 * described by 4 corners
 */
function inPolygon(x, y, corners) {
  // make sure point is in the correct x bounds
  if (x < corners.leftStart.x || x > corners.rightStart.x) {
    return false;
  }

  // get the lines in "mx + b" form
  var topSlope = (corners.leftStart.y - corners.rightStart.y) / (corners.leftStart.x - corners.rightStart.x);
  var topIntersect = corners.leftStart.y - (topSlope * corners.leftStart.x);

  var bottomSlope = (corners.leftEnd.y - corners.rightEnd.y) / (corners.leftEnd.x - corners.rightEnd.x);
  var bottomIntersect = corners.leftEnd.y - (bottomSlope * corners.leftEnd.x);

  // determine if point is below top line and above bottom line
  var belowTop = y > topSlope * x + topIntersect; // > is intentional
  var aboveBottom = y < bottomSlope * x + bottomIntersect;

  return belowTop && aboveBottom;
}

/*
 * Given a selected polygon's info { parent: parentCol, child: childCol, matchNumber: index }
 */
function updateMatchInspector(polygonInfo) {
  highlightedPolygon = polygonInfo;
  // highlight new polygon
  addCanvasHTML(numberOfMatchesPerColumn);
  var prefix = "#cols-" + polygonInfo.parent + "-" + polygonInfo.child + "-";
  var leftHTML = getMatchHTML(prefix, "left", polygonInfo.matchNumber);
  var rightHTML = getMatchHTML(prefix, "right", polygonInfo.matchNumber);
  
  $("#inspector-left").html(leftHTML);
  $("#inspector-right").html(rightHTML);
}

/*
 * 
 */
function getMatchHTML(prefix, side, matchNumber) {
  var startId = prefix + side + "-start-match-" + matchNumber;
  var endId =  prefix + side + "-end-match-" + matchNumber;
  var contents =  $(startId).nextUntil(endId).clone();
  var newContents = {};

  for (var jqueryObjectIndex in contents) {
    var entry = contents[jqueryObjectIndex]
    if (entry.id == undefined || entry.id.length == 0) {
      newContents[jqueryObjectIndex] = contents[jqueryObjectIndex];
    }
  }
  return contents;
}

function populatePreviewList(previousNode) {
  // don't clear a path of one node.
  if (previousNode == undefined) {
    return;
  }

  var listHTML = $("#node-preview-list");
  listHTML.html("");

  for (var i = 0; i < previousNode.sourceLinks.length; i++) {
    var sourceLink = previousNode.sourceLinks[i];
    var target = sourceLink.target
    var uid = target.uid;
    var name = target.description;
    var author = uid.substring(0, uid.lastIndexOf("_"));
    var date = target.created_at;
    var imageURL = "assets/thumbnail1.png"; // TODO: update this to actual preview image

    var nodeHTML = $("<div class='node-preview'> </div>");
    var hiddenHTML = $("<span class='hidden-uid'> " + uid + "</span>");
    var nameHTML = $("<span class='preview-attr name'> " + name + "</span><br>");
    var authorHTML = $("<span class='preview-attr author'> " + author + "</span><br>");
    var dateHTML = $("<span class='preview-attr date'> " + date + "</span><br>");
    var imageHTML = $("<img class='preview' src='" + imageURL + "'>");
    nodeHTML.append(hiddenHTML);
    nodeHTML.append(nameHTML);
    nodeHTML.append(authorHTML);
    nodeHTML.append(dateHTML);
    nodeHTML.append(imageHTML);

    nodeHTML.on("click", function() {
      var uid = $(".hidden-uid", this).text().trim();
      extendPathWithNode(nodeMap[uid]);
    });

    listHTML.append(nodeHTML);
  }
}








