//global variables
var frameSelElement = document.getElementById("frame-select");
var frameSelect = frameSelElement.options[frameSelElement.selectedIndex].value;

var orfElement = document.getElementById("show-orfs");
var orfSelect = orfElement.checked;

var displaySeqElement = document.getElementById("display-seq");
var displaySeq = displaySeqElement.checked;

var showAnimationElement = document.getElementById("show-animations");
var showAnimations = showAnimationElement.checked;

//MAIN D3 FUNCTIONALITY:
document.onload = (function(d3){
  "use strict";

  // define graphcreator object
  var GraphCreator = function(svg, nodes, edges, transcripts){
    var thisGraph = this;
        thisGraph.idct = 0;

    thisGraph.nodes = nodes || [];
    thisGraph.edges = edges || [];
    thisGraph.transcripts = transcripts || [];

    thisGraph.state = {
      selectedNodes: [],
      selectedEdges: [], //array of the edge svg element IDs for manipulation
      numSelectedNodes: 0,
      selectedTranscript: "",
      selectedTransRow: null,
      selectedEdge: null,
      mouseDownNodes: [],
      mouseDownLink: null,
      mouseDownTrans: null,
      justDragged: false,
      justScaleTransGraph: false,
      lastKeyDown: -1,
      selectedSeq: "",
      seqVis: null,
      grid: null
    };

    // define arrow markers for graph links
    var defs = svg.append('svg:defs');
    defs.append('svg:marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', "6")
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');

    // define arrow markers for leadingarrow
    defs.append('svg:marker')
      .attr('id', 'mark-end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', "6")
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');

    thisGraph.svg = svg;
    thisGraph.svgG = svg.append("g")
          .classed(thisGraph.consts.graphClass, true);
    var svgG = thisGraph.svgG;

    // svg nodes and edges
    thisGraph.paths = svgG.append("g").selectAll("g");
    thisGraph.circles = svgG.append("g").selectAll("g");
    thisGraph.transcriptPathIndicators = svgG.append("g").selectAll("g");

    thisGraph.drag = d3.behavior.drag()
          .origin(function(d){
            return {x: d.x, y: d.y};
          })
          .on("drag", function(args){
            thisGraph.state.justDragged = true;
            thisGraph.dragmove.call(thisGraph, args);
          })
          .on("dragend", function() {
            // todo check if edge-mode is selected
          });

    //improved Seq Viewer using biojs-vis-sequence
    var seqDiv = document.getElementById('seq-view');
    var Seq = require("biojs-vis-sequence");
    if( thisGraph.state.numSelectedNodes == 0 ){
      seqDiv.textContent = "No selection."
    } else {
      seqDiv.textContent = thisGraph.state.selectedTranscript + ", Nodes: " + String(thisGraph.state.selectedNodes);
    }

    thisGraph.state.seqVis = new Seq({
      sequence : thisGraph.state.selectedSeq,
      target : seqDiv.id,
      format : 'CODATA',
      frame : '2',
      columns : { size:60,spacedEach:10 },
      formatOptions : {
        title:false,
        footer:false
      },
      id : thisGraph.selectedTranscript
    });

    // d3 listeners! Listen for key events
    d3.select(window).on("keydown", function(){
      thisGraph.svgKeyDown.call(thisGraph);
    })
    .on("keyup", function(){
      thisGraph.svgKeyUp.call(thisGraph);
    });
    svg.on("mousedown", function(d){thisGraph.svgMouseDown.call(thisGraph, d);});
    svg.on("mouseup", function(d){thisGraph.svgMouseUp.call(thisGraph, d);});

    d3.select("#frame-select").on("change", function(){
      frameSelect = frameSelElement.options[frameSelElement.selectedIndex].value;
      thisGraph.updateSequenceView();
    });
    d3.select("#show-orfs").on("click", function(){
      orfSelect = orfElement.checked;
      thisGraph.updateSequenceView();
    });
    d3.select("#display-seq").on("click", function(){
      displaySeq = displaySeqElement.checked;

      //hide or unhide the sequence view when box is clicked
      if( displaySeq ){
        document.getElementById("seq-view").style.visibility = "visible";
        thisGraph.updateSequenceView();
      } else {
        document.getElementById("seq-view").style.visibility = "hidden";
      }
    });
    d3.select("#show-animations").on("click", function(){
      showAnimations = showAnimationElement.checked;
    });

    // listen for dragging
    var dragSvg = d3.behavior.zoom()
          .on("zoom", function(){
            if (d3.event.sourceEvent.shiftKey){
              // TODO the internal d3 state is still changing
              return false;
            } else{
              thisGraph.zoomed.call(thisGraph);
            }
            return true;
          })
          .on("zoomstart", function(){
            var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
            if (ael){
              ael.blur();
            }
            if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
          })
          .on("zoomend", function(){
            d3.select('body').style("cursor", "auto");
          });

    svg.call(dragSvg).on("dblclick.zoom", null);

    // listen for resize
    window.onresize = function(){thisGraph.updateWindow(svg);};
  };

  GraphCreator.prototype.setIdCt = function(idct){
    this.idct = idct;
  };

  GraphCreator.prototype.consts = {
    selectedClass: "selected",
    selectedFirstClass: "selectedFirst",
    connectClass: "connect-node",
    circleGClass: "conceptG",
    graphClass: "graph",
    activeEditId: "active-editing",
    BACKSPACE_KEY: 8,
    DELETE_KEY: 46,
    ENTER_KEY: 13,
    UP_ARROW: 38,
    DOWN_ARROW: 40,
    nodeHeight: 30
  };

  var nodeWidthFromSeq = d3.scale.linear();
    nodeWidthFromSeq.domain([1, 1500]);
    nodeWidthFromSeq.range([60, 400]);

  /* PROTOTYPE FUNCTIONS */

  GraphCreator.prototype.dragmove = function(d) {
    var thisGraph = this;
    d.x += d3.event.dx;
    d.y += d3.event.dy;
    thisGraph.updateGraph();
  };

  /* Consider renaming to insertTitle
  insert svg line breaks: taken from http://stackoverflow.com/questions/13241475/how-do-i-include-newlines-in-labels-in-d3-charts */
  GraphCreator.prototype.insertTitleLinebreaks = function (gEl, title, w) {
    var words = title.split(/\s+/g),
        nwords = words.length;
    var el = gEl.append("text")
                .text(title)
                .attr("text-anchor", "middle")
                .attr("x", nodeWidthFromSeq(w)/2)
                .attr("y", "20");
  };

  GraphCreator.prototype.insertEdgeLabel = function (gEl, title) {
    var el = gEl.append("text")
                .text(title)
                .attr("text-anchor", "middle")
                .attr("x", "20")
                .attr("y", "20");
  };

  GraphCreator.prototype.replaceSelectEdge = function(d3Path, edgeData){
    var thisGraph = this;
    d3Path.classed(thisGraph.consts.selectedClass, true);
    if (thisGraph.state.selectedEdge){
      thisGraph.removeSelectFromEdge();
    }
    thisGraph.state.selectedEdge = edgeData;
  };

  GraphCreator.prototype.replaceSelectNode = function(d3Node, nodeData){
    var thisGraph = this;

    if (thisGraph.state.numSelectedNodes > 0){
      thisGraph.removeSelectFromNodes();
    }

    //add selected class to the node that was clicked
    d3Node.classed(this.consts.selectedClass, true);
    thisGraph.state.numSelectedNodes = 1;
    thisGraph.state.selectedNodes.push(String(nodeData.id));

    //display text in bottom
    if( displaySeq ){
      thisGraph.updateSequenceView();
    }
  };

  //should only be used if at least one node is already selected
  GraphCreator.prototype.addSelectNode = function(d3Node, nodeData){
    var thisGraph = this;

    //add selected class to the node that was clicked
    d3Node.classed(this.consts.selectedClass, true);

    if(thisGraph.state.selectedNodes.indexOf(nodeData.id) == -1){
      //node is not currently selected
      thisGraph.state.numSelectedNodes += 1;
      thisGraph.state.selectedNodes.push(String(nodeData.id));
    }

    //display text in bottom
    if( displaySeq ){
      thisGraph.updateSequenceView();
    }
  };

    //****************************//
   // BEGIN MILES' NEW FUNCTIONS //
  //****************************//

  //helper for seq-view (Get the nodes index in the data from its ID)
  GraphCreator.prototype.nodeIndexFromID = function(nodeId){
    var thisGraph = this;
    var returnIndex;
    thisGraph.nodes.forEach( function(element, index, array){
      if( element.id == nodeId) {
        returnIndex = index;
        return;
      }
    });
    return returnIndex;
  };
  //helper for seq-view (Return the reverse compliment of a sequence)
  GraphCreator.prototype.translateToReverse = function(sequence){
    var seqArray = sequence.split('').reverse();
    var returnSeq = "";
    for (var i = 0; i < seqArray.length; i++){
      if( seqArray[i] == "A" ){
        returnSeq = returnSeq.concat("T");
      } else if( seqArray[i] == "C" ){
        returnSeq = returnSeq.concat("G");
      } else if( seqArray[i] == "G" ){
        returnSeq = returnSeq.concat("C");
      } else if( seqArray[i] == "T" ){
        returnSeq = returnSeq.concat("A");
      }
    }
    return returnSeq;
  };

  //TO DO:
  //Get all selected node sequences and concatenate them
  //Then format all pretty like for output
  GraphCreator.prototype.updateSequenceView = function(){
    var thisGraph = this;
    var selectedNodes = thisGraph.circles.filter(function(cd) {
      //return true for each node that is selected (ID is in selectedNodes)
      return (thisGraph.state.selectedNodes.indexOf(String(cd.id)) > -1);
    });

    var sequence = "";
    //save sequences of selected nodes to sequence
    thisGraph.state.selectedNodes.forEach( function(element, index, array){
      if( index == array.length - 1 ){
        //if last in transcript, append whole sequence
        sequence += thisGraph.nodes[thisGraph.nodeIndexFromID(element)].seq;
      } else {
        //have to append only the start of the sequenc up until the overlap with next node
        var nodeString = thisGraph.nodes[thisGraph.nodeIndexFromID(element)].seq;
        sequence += nodeString.substring(0, nodeString.length);
      }
    });

    /* IMPROVED SEQ VIEW CODE USING biojs-vis-sequence@0.1.7 */
    /* This portion of code results in much performance loss. :( */

    //mySequence.setSelection(1,4);
    //mySequence.setSelection(2,4);

    //frameSequence stores the frame-translated sequence
    var frameSequence;
    if( frameSelect <= 3){
      frameSequence = sequence;
    } else if ( frameSelect > 3){
      frameSequence = thisGraph.translateToReverse(sequence); //.split('').reverse().join('');
    }
    thisGraph.state.seqVis.setSequence(frameSequence);

    thisGraph.state.seqVis.show();

    thisGraph.state.seqVis.removeAllAnnotations();
    thisGraph.state.seqVis.removeAllHighlights();

    if( !orfSelect ){
      return;
    }

    //Find all open reading frames
    var starts = [];
    var stops = [];
    var ORFs = [];
    var openingStart = -1;
    var inFrame = false;
    var count = 0;
    var offset;
    if( frameSelect < 4 ) {
      offset = frameSelect - 1;
    } else {
      offset = frameSelect - 4
    }

    //HAVE TO DEAL WITH REVERSE FRAMES

    for (var i = offset; i < frameSequence.length; i += 3){
      //scan until start
      if( frameSequence.substring(i,i+3) == "ATG" ){
        starts.push(i+1);
        if( !inFrame ){
          openingStart = i+1;
          inFrame = true;
        }
      } else if( frameSequence.substring(i,i+3) == "TAA" || frameSequence.substring(i,i+3) == "TAG" || frameSequence.substring(i,i+3) == "TGA" ){
        stops.push(i+1);
        if( inFrame ){
          count++;
          ORFs.push({start: openingStart, end: i+3});
          inFrame = false;
        }
      }
    }

    var longestORF = "";
    var longestORFLength = 0;
    //Add highlights for start and stop codons, and annotations for ORFs
    starts.forEach( function(element, index, array){
      thisGraph.state.seqVis.addHighlight(
        { "start": element, "end": element+2, "color": "white", "background": "green", "id": "Start"+index }
      );
    });
    stops.forEach( function(element, index, array){
      thisGraph.state.seqVis.addHighlight(
        { "start": element, "end": element+2, "color": "white", "background": "red", "id": "Stop"+index }
      );
    });
    ORFs.forEach( function(element, index, array){
      var lengthBP = element.end - element.start + 1;
      if( lengthBP > longestORFLength ){
        longestORF = "ORF" + (index+1);
        longestORFLength = lengthBP;
      }
      thisGraph.state.seqVis.addAnnotation({
        name: "ORF " + (index+1),
        html: "Length: " + lengthBP + "bp, " + (lengthBP-3)/3 + "AAs",
        color: "blue",
        regions: [{ start: element.start, end: element.end }]
      });
    });

    //using textContent function removes descendent nodes, here is a workaround
    var seqTitle = document.createTextNode("Transcript: " + thisGraph.state.selectedTranscript + ", Nodes: " + String(thisGraph.state.selectedNodes));
    if( count > 0 ){
      var seqSummary = document.createTextNode("Summary: " + count + " ORFs, Longest ORF: " + longestORF + " (" + longestORFLength + " bps, " + (longestORFLength-3)/3 + " AAs)");
    } else {
      var seqSummary = document.createTextNode("Summary: 0 ORFs");
    }
    var element = document.getElementById("seq-view");

    var newDiv = document.createElement("div");
    newDiv.appendChild(seqTitle, element.firstChild);
    newDiv.appendChild(document.createElement("BR"), element.firstChild);
    newDiv.appendChild(seqSummary, element.firstChild);

    element.removeChild(element.childNodes[0]);
    element.insertBefore(newDiv, element.childNodes[0]);
  };

  GraphCreator.prototype.replaceSelectWithTranscript = function(name, transcript){
    //var start = new Date().getTime();
    //console.log("GO");

    var thisGraph = this;
    //remove select from nodes
    thisGraph.circles.filter(function(cd) {
      //return true for each node that is selected (ID is in selectedNodes)
      return (thisGraph.state.selectedNodes.indexOf(String(cd.id)) > -1);
    }).classed(thisGraph.consts.selectedClass, false)
    .classed(thisGraph.consts.selectedFirstClass, false);


    //** NODES **
    //change selectedNodes to the transcripts nodes and update num selected
    thisGraph.state.selectedNodes = transcript;
    thisGraph.state.selectedTranscript = name;
    thisGraph.state.numSelectedNodes = transcript.length;
    //add selected class to new selected nodes
    thisGraph.circles.filter(function(cd) {
      //return true for each node that is selected (ID is in selectedNodes)
      return (thisGraph.state.selectedNodes.indexOf(String(cd.id)) > -1);
    }).classed(thisGraph.consts.selectedClass, true);

    thisGraph.circles.filter(function(cd) {
      //return true only the first node in the transcript
      return (thisGraph.state.selectedNodes.indexOf(String(cd.id)) == 0);
    }).classed(thisGraph.consts.selectedFirstClass, true);


    //REMOVE CURRENT OUTLINE EDGES:
    thisGraph.removeOutline();

    //** EDGES **
    //change selectedEdges to the edges between nodes in the transcript
    var transEdges = [];
    for (var i = 0; i < transcript.length; i++){
      if( i < transcript.length - 1 ){
        var edgeString = "e" + transcript[i] + "-" + transcript[i+1];
        transEdges.push(edgeString);
      }
    }
    thisGraph.state.selectedEdges = transEdges;
    //console.log(thisGraph.state.selectedNodes);
    //THIS FUNCTION IS THE BIGGEST PERFORMANCE HIT!
    //Will improve if tool uses Transcript sequence instead of building it
    if( displaySeq ){
      thisGraph.updateSequenceView();
    }

    // ****************************** //
    if( showAnimations ){
      thisGraph.outlineTranscript();
    }
    // ****************************** //

    //Display transcript sequence
    //var end = new Date().getTime();
    //var time = end - start;
    //console.log("DONE: " + time);
  };

  //mousedown on transcript
  GraphCreator.prototype.transMouseDown = function(d3transcript, t){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownTrans = t;
  };

  // mouseup on transcript
  /*
  GraphCreator.prototype.transMouseUp = function(d3transcript, t){
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // resetthe states
    state.shiftNodeDrag = false;
    d3transcript.classed(consts.connectClass, false);

    var mouseDownTrans = state.mouseDownNode;

    if (!mouseDownTrans) return;

    if (mouseDownTrans !== t){
      return;
    } else {
      //deal with selections and stuff
      thisGraph.replaceSelectWithTranscript(t);
    }
    state.mouseDownTrans = null;
    return;

  };*/


  //Remove the dashed line indicator for the transcript node order
  GraphCreator.prototype.removeOutline = function(){
    var thisGraph = this;

    thisGraph.state.selectedEdges.forEach( function(element, index, array){
      d3.select("#" + element).attr("stroke-dasharray", null)
        .attr("stroke-dashoffset", null)
        .attr("stroke-dashoffset", null);
    });
  }

  //Creates a dashed line animation to better view the transcript
  GraphCreator.prototype.outlineTranscript = function(){
    var thisGraph = this;

    var totalLength;
    thisGraph.state.selectedEdges.forEach( function(element, index, array){
      //console.log(thisGraph.state.selectedEdges);
      totalLength = document.getElementById(element).getTotalLength();
      d3.select("#" + element).attr("stroke-dasharray", 12 + " " + 8)
        .attr("stroke-dashoffset", 50)
        .transition()
          .duration(500)
          .ease("linear")
          .attr("stroke-dashoffset", 0)
          .delay(index*500);
    });
  }

    //***************************//
   // END MILES's NEW FUNCTIONS //
  //***************************//

  GraphCreator.prototype.removeSelectFromNodes = function(){
    var thisGraph = this;

    thisGraph.removeOutline();

    console.log(this.state.selectedNodes);

    thisGraph.circles.filter(function(cd) {
      //return true for each node that is selected (ID is in selectedNodes)
      return (thisGraph.state.selectedNodes.indexOf(String(cd.id)) > -1);
    }).classed(thisGraph.consts.selectedClass, false)
    .classed(thisGraph.consts.selectedFirstClass, false);

    thisGraph.state.numSelectedNodes = 0;
    thisGraph.state.selectedNodes = [];

    //NEW
    thisGraph.state.selectedEdges = [];
  };

  GraphCreator.prototype.removeSelectFromEdge = function(){
    var thisGraph = this;
    thisGraph.paths.filter(function(cd){
      return cd === thisGraph.state.selectedEdge;
    }).classed(thisGraph.consts.selectedClass, false)
    .classed(thisGraph.consts.selectedFirstClass, false);
    thisGraph.state.selectedEdge = null;
  };

  GraphCreator.prototype.pathMouseDown = function(d3path, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownLink = d;

    if (state.numSelectedNodes > 0){
      thisGraph.removeSelectFromNodes();
    }

    var prevEdge = state.selectedEdge;
    if (!prevEdge || prevEdge !== d){
      thisGraph.replaceSelectEdge(d3path, d);
    } else{
      thisGraph.removeSelectFromEdge();
    }
  };

  // mousedown on node
  GraphCreator.prototype.circleMouseDown = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownNode = d;
  };

  // mouseup on nodes
  GraphCreator.prototype.circleMouseUp = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // resetthe states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    var mouseDownNode = state.mouseDownNode;

    if (!mouseDownNode) return;

    //thisGraph.dragLine.classed("hidden", true);

    if (mouseDownNode !== d){
      // we're in a different node: create new edge for mousedown edge and add to graph
      //NO DON'T!
      /*
      var newEdge = {source: mouseDownNode, target: d};
      var filtRes = thisGraph.paths.filter(function(d){
        if (d.source === newEdge.target && d.target === newEdge.source){
          thisGraph.edges.splice(thisGraph.edges.indexOf(d), 1);
        }
        return d.source === newEdge.source && d.target === newEdge.target;
      });
      if (!filtRes[0].length){
        thisGraph.edges.push(newEdge);
        thisGraph.updateGraph();
      }
      */
    } else{
      // we're in the same node
      if (state.justDragged) {
        // dragged, notclicked
        state.justDragged = false;
      } else{
        // clicked, not dragged
        if (d3.event.shiftKey){
          // shift-clicked node:
          /* TO DO: CHECK IF NEW NODE IS PART OF PATH TO ALREADY SELECTED NODES
            THEN ADD TO SELECTION
          var d3txt = thisGraph.changeTextOfNode(d3node, d);
          var txtNode = d3txt.node();
          thisGraph.selectElementContents(txtNode);
          txtNode.focus();
          */
          thisGraph.addSelectNode(d3node, d);
        } else{
          if (state.selectedEdge){
            thisGraph.removeSelectFromEdge();
          }

          //if clicked node is not in selectedNodes,
          //remove all selection and replace with new node
          thisGraph.replaceSelectNode(d3node, d);
        }
      }
    }
    state.mouseDownNode = null;
    return;

  }; // end of circles mouseup

  // mousedown on main svg
  GraphCreator.prototype.svgMouseDown = function(){
    this.state.graphMouseDown = true;
  };

  // mouseup on main svg
  GraphCreator.prototype.svgMouseUp = function(){
    var thisGraph = this,
      state = thisGraph.state;
      // dragged notclicked

    if( state.graphMouseDown && !(state.justScaleTransGraph) ){
      thisGraph.removeSelectFromNodes();
    }
    state.justScaleTransGraph = false;
    state.graphMouseDown = false;
  };

  // keydown on main svg
  GraphCreator.prototype.svgKeyDown = function() {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // make sure repeated key presses don't register for each keydown
    if(state.lastKeyDown !== -1) return;

    state.lastKeyDown = d3.event.keyCode;
    var selectedNode = state.selectedNodes,
        selectedEdge = state.selectedEdge;

    switch(d3.event.keyCode) {
    case consts.BACKSPACE_KEY:
    case consts.DELETE_KEY:
      d3.event.preventDefault();
      if (selectedNode){
        thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
        thisGraph.spliceLinksForNode(selectedNode);
        state.selectedNode = null;
        thisGraph.updateGraph();
      } else if (selectedEdge){
        thisGraph.edges.splice(thisGraph.edges.indexOf(selectedEdge), 1);
        state.selectedEdge = null;
        thisGraph.updateGraph();
      }
      break;
    /*case consts.UP_ARROW:
      d3.event.preventDefault();
      console.log("up pressed");

      if( state.selectedTransRow <= 0 ){
        //  do nothing
      } else if ( state.selectedTransRow > 0 ){
        var newSelect = grid.getSelectedRows();
        state.selectedTransRow--;
        grid.setSelectedRows(state.selectedTransRow);
        thisGraph.updateGraph();
      }
    case consts.DOWN_ARROW:
      d3.event.preventDefault();
      console.log("down pressed");

      if( state.selectedTransRow < 0 || state.selectedTransRow == transcripts.length - 1 ){
        //do nothing
      } else if( thisGraph.state.selectedTransRow > 0 ){
        state.selectedTransRow++;
        grid.setSelectedRows(state.selectedTransRow);
        //  add highlighting of slickgrid row
        thisGraph.updateGraph()
      }*/
    }
  };

  GraphCreator.prototype.svgKeyUp = function() {
    this.state.lastKeyDown = -1;
  };

  // call to propagate changes to graph
  GraphCreator.prototype.updateGraph = function(){

    var thisGraph = this,
        consts = thisGraph.consts,
        state = thisGraph.state;

    //check if transcript selection has changed by arrow keys
    if( grid.getSelectedRows() != state.selectedTransRow ){
      var rowIdx = grid.getSelectedRows();
      //this.replaceSelectWithTranscript(grid.)
      //console.log(grid.getData([rowIdx]));
      //console.log(grid.getItem(grid.getSelectedRows()).getItemById(pathnodes));
    }

    //console.log("before function", thisGraph.edges);
    //var counter = 0;
    try{
      thisGraph.paths = thisGraph.paths.data(thisGraph.edges, function(d){
        //counter++;
        //console.log(String(d.source.id) + "+" + String(d.target.id));
        return "e" + String(d.source.id) + "-" + String(d.target.id);
      });
    } catch(TypeError) {
    }
    //console.log(counter);
    //console.log("after function", thisGraph.edges);

    var paths = thisGraph.paths;
    // update existing paths
    paths.style('marker-end', 'url(#end-arrow)')
      .classed(consts.selectedClass, function(d){
        return d === state.selectedEdge;
      })
      .attr("d", function(d){

        var startCoord = "";
        var endCoord = "";
        /* For Oases with negative nodes
        if( d.source.id < 0 ){
          //edge exits from left of source node
          startCoord = d.source.x - (nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y;
        } else {
          //edge exits from right of source node
          startCoord = d.source.x + (nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y;
        }
        */
        startCoord = d.source.x + (nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y;

        /* For Oases with negative nodes
        //this if statement must be the same as in the next function (add new paths)
        if( d.target.id < 0){
          if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
            //point to bottom corner
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 2) + "," + (d.target.y + consts.nodeHeight/2);
          } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
            //point to top corner
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 2) + "," + (d.target.y - consts.nodeHeight/2);
          } else {
            //point to middle
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 5) + "," + (d.target.y);
          }
        } else {
          if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
            //point to bottom corner
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y + consts.nodeHeight/2);
          } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
            //point to top corner
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y - consts.nodeHeight/2);
          } else {
            //point to middle
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 5) + "," + (d.target.y);
          }
        }

        if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
          //point to bottom corner
          endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y + consts.nodeHeight/2);
        } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
          //point to top corner
          endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y - consts.nodeHeight/2);
        } else {
          //point to middle
          endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 5) + "," + (d.target.y);
        }

        return "M" + startCoord + "L" + endCoord;*/

        //OLD METHOD
        if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
          //pointto bottom leftcorner
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2) + "," + (d.target.y + consts.nodeHeight/2);
        } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
          //pointto top leftcorner
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2) + "," + (d.target.y - consts.nodeHeight/2);
        } else {
          //pointto middle of left side
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 5) + "," + (d.target.y);
        }
      });

    // add new paths
    paths.enter()
      .append("path")
      .style('marker-end','url(#end-arrow)')
      .attr("id", function(d){ return String("e" + d.source.id + "-" + d.target.id); })
      .classed("link", true)
      .attr("d", function(d){
        var startCoord, endCoord;
        if( d.source.id < 0 ){
          //edge exits from left of source node
          startCoord = d.source.x - (nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y;
        } else {
          //edge exits from right of source node
          startCoord = d.source.x + nodeWidthFromSeq(d.source.w)/2 + "," + d.source.y;
        }

        /*
        if( d.target.id < 0){
          if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
            //point to bottom corner
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 2) + "," + (d.target.y + consts.nodeHeight/2);
          } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
            //point to top corner
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 2) + "," + (d.target.y - consts.nodeHeight/2);
          } else {
            //point to middle
            endCoord = (d.target.x + nodeWidthFromSeq(d.target.w)/2 + 5) + "," + (d.target.y);
          }
        } else {
          if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
            //point to bottom corner
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y + consts.nodeHeight/2);
          } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
            //point to top corner
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 2) + "," + (d.target.y - consts.nodeHeight/2);
          } else {
            //point to middle
            endCoord = (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 5) + "," + (d.target.y);
          }
        }

        return "M" + startCoord + "L" + endCoord;*/
        //old method
        if( d.source.y - consts.nodeHeight/2 > d.target.y + consts.nodeHeight/2 ) {
          //pointto bottom leftcorner
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2) + "," + (d.target.y + consts.nodeHeight/2);
        } else if( d.source.y + consts.nodeHeight/2 < d.target.y - consts.nodeHeight/2 ) {
          //pointto top leftcorner
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2) + "," + (d.target.y - consts.nodeHeight/2);
        } else {
          //pointto middle of left side
          return "M" + (d.source.x + nodeWidthFromSeq(d.source.w)/2) + "," + d.source.y + "L" + (d.target.x - nodeWidthFromSeq(d.target.w)/2 - 5) + "," + (d.target.y);
        }
      })
      .on("mousedown", function(d){
        thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
        }
      )
      .on("mouseup", function(d){
        state.mouseDownLink = null;
      });

    /* TO DO, DISPLAY TEXT OVER PATH
      Maybe put both path and a text label inside another g tag like the nodes are done.

    var pathLabels = paths.enter().append("text")
      .attr("x", 10)
      .attr("y", 15)

    pathLabels.append("textPath")
      .attr("xlink:href", function(d){
        return String(d.source.id + "-" + d.target.id);
      })
      .text(function(d){
        return String(d.weight);
      });
    */


    // remove old links
    //paths.exit().remove();

    // update existing nodes
    thisGraph.circles = thisGraph.circles.data(thisGraph.nodes, function(d){ return d.id;});
    thisGraph.circles.attr("transform", function(d){return "translate(" + (d.x-nodeWidthFromSeq(d.w)/2) + "," + (d.y-consts.nodeHeight/2) + ")";});

    // add new nodes
    var newGs = thisGraph.circles.enter()
          .append("g");

    newGs.classed(consts.circleGClass, true)
      .attr("transform", function(d){return "translate(" + (d.x-nodeWidthFromSeq(d.w)/2) + "," + (d.y-consts.nodeHeight/2) + ")";})
      .on("mouseout", function(d){
        d3.select(this).classed(consts.connectClass, false);
      })
      .on("mousedown", function(d){
        thisGraph.circleMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d){
        thisGraph.circleMouseUp.call(thisGraph, d3.select(this), d);
      })
      .call(thisGraph.drag);

    newGs.append("rect")
      .attr("height", String(consts.nodeHeight))
      .attr("width", function(d) {
        return String(nodeWidthFromSeq(d.w));
    });

    newGs.each(function(d){
      thisGraph.insertTitleLinebreaks(d3.select(this), d.title, d.w);
    });
    //console.log("end of update", thisGraph.edges);

  };
  // END UPDATEGRAPH

  GraphCreator.prototype.zoomed = function(){
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
      .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
  };

  GraphCreator.prototype.updateWindow = function(svg){
    var docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('div')[0];
    var x = bodyEl.clientWidth;
    var y = bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
  };

  /**** MAIN ****/

  // (DON'T) warn the user when leaving (that is annoying)
  //window.onbeforeunload = function(){
  //  return "Make sure to save your graph locally before leaving :-)"; <- emoticons don't make it less annoying
  //};

  var docEl = document.documentElement,
      bodyEl = document.getElementsByTagName('div')[0];

  var width = bodyEl.clientWidth,
      height =  bodyEl.clientHeight;

  /* ==================== */
  /* Transcript SlickGrid */
  /* ==================== */

  var grid, data = transcripts;
  var columns = [
    {
      id: "name",
      name: "Name",
      field: "name",
      width: 200,
      resizeable: true,
      sortable: true
    },
    {
      id: "length",
      name: "Length",
      field: "length",
      width: 200,
      resizeable: true,
      sortable: true
    },
    {
      id: "confidence",
      name: "Confidence Val",
      field: "confidence",
      width: 200,
      resizeable: true,
      sortable: true
    },
    {
      id: "nodes",
      name: "Nodes in Path",
      field: "pathnodes",
      width: 600,
      resizeable: true,
      sortable: false
    }
  ];

  var options = {
    enableCellNavigation: true,
    enableColumnReorder: true,
    forceFitColumns: true,
    enableRowReorder: true
  };

  grid = new Slick.Grid("#trans-table", transcripts, columns, options);
  grid.setSelectionModel(new Slick.RowSelectionModel());
  grid.onClick.subscribe(function(e, args) {
    var item = args.grid.getData()[args.row];

    grid.setSelectedRows(args.row);
    graph.state.selectedTransRow = args.row;

    //pass transcript selection to graph-creator.js
    graph.replaceSelectWithTranscript(item.name, item.pathnodes);
  });
  grid.onKeyDown.subscribe(function(e, args) {
    var state = graph.state;
    if( e.which == 38 ){
      if( state.selectedTransRow <= 0 ){
        //do nothing
      } else {
        state.selectedTransRow--;
        var newTrans = args.grid.getData()[state.selectedTransRow];
        graph.replaceSelectWithTranscript(newTrans.name, newTrans.pathnodes);
      }
    } else if( e.which == 40){
      if( state.selectedTransRow < 0 || state.selectedTransRow >= transcripts.length ){
        //do nothing
      } else {
        state.selectedTransRow++;
        var newTrans = args.grid.getData()[state.selectedTransRow];
        graph.replaceSelectWithTranscript(newTrans.name, newTrans.pathnodes);
      }
    }
  });

  //Sorting function
  //  Currently works with Trinity (Oases sort in comment)
  var gridSorter = function(columnField, isAsc, grid, transcripts) {
       var sign = isAsc ? 1 : -1;
       var field = columnField;
       //if sorting by name, cut off Trans part and sort numerically

       if( field == "name" ) {
          transcripts.sort(function (dataRow1, dataRow2) {
              //OASES:
              //var value1 = parseInt(dataRow1[field].substring(5)), value2 = parseInt(dataRow2[field].substring(5));
              //TRINITY
              var value1 = dataRow1[field], value2 = dataRow2[field];
              var result = (value1 == value2) ? 0 :
                         ((value1 > value2 ? 1 : -1)) * sign;
              return result;
          });
       } else {
         transcripts.sort(function (dataRow1, dataRow2) {
                var value1 = dataRow1[field], value2 = dataRow2[field];
                var result = (value1 == value2) ? 0 :
                           ((value1 > value2 ? 1 : -1)) * sign;
                return result;
         });
      }
      grid.invalidate();
      grid.render();
   }
   // Initially sort ascending by transcript name
   gridSorter("name", true, grid, transcripts);
   grid.setSortColumn("name", true);


  //call grid sorter function on sort
  grid.onSort.subscribe(function(e, args) {
    gridSorter(args.sortCol.field, args.sortAsc, grid, transcripts);
  });

  /** MAIN SVG **/
  var svg = d3.select("#graph-view").classed("svg-container", true)
    .append("svg")
    //.attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 " + width + " " + height)
    .classed("svg-content-responsive", true);
    //    .attr("width", width)
    //    .attr("height", height);
  var graph = new GraphCreator(svg, nodes, edges);
      graph.setIdCt(2);
  graph.updateGraph();

})(window.d3);
