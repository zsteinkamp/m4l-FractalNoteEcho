autowatch = 1;
inlets = 12;
outlets = 5;

// inlets
const INLET_NOTE = 0;
const INLET_VELOCITY = 1;
const INLET_ITERATIONS = 2;
const INLET_STRETCH = 3;
const INLET_DECAY = 4;
const INLET_NOTEINCR = 5;
const INLET_BASE1 = 6;
const INLET_BASE2 = 7;
const INLET_BASE3 = 8;
const INLET_BASE4 = 9;
const INLET_DUR_BASE = 10;
const INLET_DUR_DECAY = 11;

// outlets
const OUTLET_NOTE = 0;
const OUTLET_VELOCITY = 1;
const OUTLET_DURATION = 2;
const OUTLET_TOTAL_NOTES = 3;
const OUTLET_TOTAL_DURATION = 4;

setinletassist(INLET_NOTE, "Note Number (int)")
setinletassist(INLET_VELOCITY, "Note Velocity (int)")
setinletassist(INLET_ITERATIONS, "Iterations (int)")
setinletassist(INLET_STRETCH, "Duration Stretch (float)")
setinletassist(INLET_DECAY, "Velocity Decay (float)")
setinletassist(INLET_NOTEINCR, "Note Increment (int)")
setinletassist(INLET_BASE1, "Tap 1")
setinletassist(INLET_BASE2, "Tap 2")
setinletassist(INLET_BASE3, "Tap 3")
setinletassist(INLET_BASE4, "Tap 4")
setinletassist(INLET_DUR_BASE, "Duration Base (float)")
setinletassist(INLET_DUR_DECAY, "Duration Decay (float)")

// outlets
setoutletassist(OUTLET_NOTE, "Note Number (int)")
setoutletassist(OUTLET_VELOCITY, "Note Velocity (int)")
setoutletassist(OUTLET_DURATION, "Note Duration (ms)")
setoutletassist(OUTLET_TOTAL_NOTES, "Number of notes (int)")
setoutletassist(OUTLET_TOTAL_DURATION, "Pattern Duration (ms)")

// set up sketch canvas
sketch.default2d();
sketch.glloadidentity();

var utils = {
  // scale the values in a numeric array to the bounds specified in newMin, newMax
  scale: function (array: number[], newMin: number, newMax: number) {
    // get range
    var min = null
    var max = null;
    for (var i = 0; i < array.length; i++) {
      if (min === null || array[i] < min) { min = array[i]; }
      if (max === null || array[i] > max) { max = array[i]; }
    }
    var range = max - min;

    type LaneMeta = {
      start: boolean,
      ms: number,
      parent: number
    }

    type NoteMeta = {
      ms: number,
      level: number,
      velocity_coeff: number,
      note_incr: number,
      duration: number,
    };
    var newRange = newMax - newMin;

    var coeff = range ? newRange / range : 0.0;

    var offset = newMin - (min * coeff);

    var returnArray = [];
    for (var i = 0; i < array.length; i++) {
      returnArray.push(array[i] * coeff + offset);
    }

    //exports.log({
    //    min: min,
    //    max: max,
    //    range: range,
    //    newRange: newRange,
    //    coeff: coeff,
    //    offset: offset,
    //    return: returnArray
    //});

    return returnArray;
  },

  HSLToRGB: function (h: number, s: number, l: number) {
    //exports.log({ h: h, s: s, l: l });

    var c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs((h / 60) % 2 - 1)),
      m = l - c / 2,
      r = 0,
      g = 0,
      b = 0;
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }
    return {
      r: r + m,
      g: g + m,
      b: b + m
    };
  },

  log: function () {
    for (var i = 0, len = arguments.length; i < len; i++) {
      var message = arguments[i];
      if (message && message.toString) {
        var s = message.toString();
        if (s.indexOf("[object ") >= 0) {
          s = JSON.stringify(message);
        }
        post(s);
      }
      else if (message === null) {
        post("<null>");
      }
      else {
        post(message);
      }
    }
    post("\n");
  }
};

// state arrays
let pattern: number[] = []; // base tap pattern
var noteRepeats: NoteMeta[] = []; // flat repeats array for scheduling notes
var vizRepeats: (LaneMeta | NoteMeta)[][] = []; // array to hold repeats for visualization

// set defaults
var options = [
  0,     // INLET_NOTE
  0,     // INLET_VELOCITY
  2,     // INLET_ITERATIONS
  0.75,  // INLET_STRETCH
  0.66,  // INLET_DECAY
  0,     // INLET_NOTEINCR
  500,   // INLET_BASE1
  1000,  // INLET_BASE2
  0,     // INLET_BASE3
  0,     // INLET_BASE4
  100,   // INLET_DUR_BASE
  0.5    // INLET_DUR_DECAY
];

// initialize
setupRepeats();

function setupRepeats() {
  // set up base pattern
  pattern = [0];
  options[INLET_BASE1] && pattern.push(Math.floor(options[INLET_BASE1]));
  options[INLET_BASE2] && pattern.push(Math.floor(options[INLET_BASE2]));
  options[INLET_BASE3] && pattern.push(Math.floor(options[INLET_BASE3]));
  options[INLET_BASE4] && pattern.push(Math.floor(options[INLET_BASE4]));

  // ensure pattern is in sorted time order
  pattern = pattern.sort(function (a, b) { return a - b; });

  // re-initialize repeats arrays
  vizRepeats = [];  // structure optimized for the visualization
  noteRepeats = []; // structure optimized for playing notes

  // populates noteRepeats and vizRepeats
  iterRepeats(options[INLET_ITERATIONS], 0, 0);
  // sort the note repeats from earliest to latest
  noteRepeats = noteRepeats.sort(function (a, b) { return a.ms - b.ms; });
  //utils.log(noteRepeats);

  // redraw the visualization
  draw();
  refresh();
}

function iterRepeats(togo: number, offsetMs: number, parentIdx: number) {
  // Initialize an array to hold information for the current visualization lane.
  // Each call to iterRepeats() will result in a new visualization lane.
  var thisLane: (LaneMeta | NoteMeta)[] = [];

  if (offsetMs > 0) {
    // not the base lane, so begin with a special node to link back to the parent
    thisLane.push({ start: true, ms: offsetMs, parent: parentIdx });
  }

  for (var idx = 0; idx < pattern.length; idx++) {
    var level = options[INLET_ITERATIONS] - togo;
    var ms = pattern[idx] * Math.pow(options[INLET_STRETCH], level);
    if (level > 0 && pattern[idx] === 0) {
      continue;
    }
    var noteMeta: NoteMeta = {
      ms: Math.floor(ms + offsetMs),
      level: level,
      velocity_coeff: Math.pow(options[INLET_DECAY], level + (idx / 4.0)),
      note_incr: options[INLET_NOTEINCR] * level,
      duration: Math.floor(options[INLET_DUR_BASE] * Math.pow(options[INLET_DUR_DECAY], level + (idx / 4.0)))
    };
    noteRepeats.push(noteMeta);

    thisLane.push(noteMeta);
  }

  // add this lane to the visualization array
  vizRepeats.push(thisLane);

  // get this lane's index to pass to iterRepeats below as the parent index
  var thisLaneIdx = vizRepeats.length - 1;

  // loop through the pattern once more to recurse into iterRepeats()
  for (var idx = 0; idx < pattern.length; idx++) {
    var level = options[INLET_ITERATIONS] - togo;
    var ms = pattern[idx] * Math.pow(options[INLET_STRETCH], level);
    if (togo > 1 && ms > 0) {
      // recurse
      iterRepeats(togo - 1, Math.floor(ms + offsetMs), thisLaneIdx);
    }
  }
}

// utility to return a function that will be used to create a note-playing task
function makeTask(r: NoteMeta, n: number, v: number) {
  return function () {
    n = Math.floor(n + r.note_incr);
    v = Math.floor(v * r.velocity_coeff);

    //utils.log({
    //  n: n,
    //  v: v,
    //  d: r.duration,
    //});

    outlet(OUTLET_DURATION, r.duration);
    outlet(OUTLET_VELOCITY, v);
    outlet(OUTLET_NOTE, n);

    // Flash the bubble
    r.is_on = true;
    draw()
    refresh()
    const t = new Task(() => {
      r.is_on = false;
      draw()
      refresh()
    });
    t.schedule(r.ms + r.duration);
  }
}

// handle int messages
function msg_int(i: number) {
  handleMessage(i);
}
// handle float messages
function msg_float(i: number) {
  handleMessage(i);
}

// method that is called when any input is received on an inlet
function handleMessage(i: any) {
  // 'inlet' is a magic M4L variable to indicate which inlet received the last message
  options[inlet] = i;

  if (inlet > INLET_VELOCITY) {
    // one of the knobs was turned, so adjust the pattern and visualization
    setupRepeats();
  }

  if (inlet === INLET_NOTE && options[INLET_VELOCITY] > 0) {
    // note played, so schedule tasks to play notes in the future
    for (var idx = 0; idx < noteRepeats.length; idx++) {
      var t = new Task(makeTask(noteRepeats[idx], options[INLET_NOTE], options[INLET_VELOCITY]));
      t.schedule(noteRepeats[idx].ms);
    }
  }
}

function draw() {
  // clear the jsui area
  sketch.glclearcolor(0.15, 0.15, 0.15, 1);
  sketch.glclear();

  var lastRepeat = vizRepeats[vizRepeats.length - 1];
  var maxMs = lastRepeat[lastRepeat.length - 1].ms;

  // Our jsui drawing boundaries.
  // Vertically it can go from -1 to 1, and horizontally from -aspect to aspect.
  // Interestingly, it's the *patcher* aspect ratio (not presentation) that matters.
  var xMin = -5.5;
  var xMax = 5.5;
  var yMin = -0.7;
  var yMax = 0.8;
  var lineWidth = 0.02;
  var baseDia = 0.25; // note circle diameter

  // Go backwards through the lanes to build up the visualization from the
  // leaves of the tree to the trunk. This avoids overlapping line issues.
  for (var vizIdx = vizRepeats.length - 1; vizIdx >= 0; vizIdx--) {
    var vizLane = vizRepeats[vizIdx];
    //utils.log(vizLane);

    // All notes in a lane have the same offset, so set up a color for them.
    var hue = (360 + (30 * (vizLane[1] as NoteMeta).note_incr) % 360) % 360;
    var color = utils.HSLToRGB(hue, 0.5, 0.4);

    if (vizIdx > 0) {
      // vertical line to connect to the parent bar
      //sketch.glcolor(0, 0, 0, 0.8);
      sketch.glcolor(color.r, color.g, color.b, 0.6);
      sketch.glrect(
        scale(vizLane[0].ms, 0, maxMs, xMin, xMax),                            // x0
        scale(vizIdx, 1, vizRepeats.length, yMin, yMax),                       // y0
        scale(vizLane[0].ms, 0, maxMs, xMin, xMax) + lineWidth,                // x1
        scale((vizLane[0] as LaneMeta).parent, 1, vizRepeats.length, yMin, yMax) + lineWidth // y1
      );
    }

    // Lane bar
    sketch.glcolor(color.r, color.g, color.b, 0.6);
    sketch.glrect(
      scale(vizLane[0].ms, 0, maxMs, xMin, xMax),                  // x0
      scale(vizIdx, 1, vizRepeats.length, yMin, yMax) - lineWidth, // y0
      scale(vizLane[vizLane.length - 1].ms, 0, maxMs, xMin, xMax), // x1
      scale(vizIdx, 1, vizRepeats.length, yMin, yMax) + lineWidth  // y1
    );

    // Note circles
    for (var rpt = 0; rpt < vizLane.length; rpt++) {
      var xPos = scale(vizLane[rpt].ms, 0, maxMs, xMin, xMax)
      var yPos = scale(vizIdx, 1, vizRepeats.length, yMin, yMax);
      //utils.log('ms: ' + vizLane[rpt].ms + ' scaled: ' + scale(vizLane[rpt].ms, 0, maxMs, -2.25, 3.25));

      sketch.moveto(xPos, yPos);

      let borderColor = 0;
      if ((vizLane[rpt] as NoteMeta).is_on) {
        borderColor = 1;
      }
      // outer black circle
      sketch.glcolor(borderColor, borderColor, borderColor, 1.0);
      sketch.circle((baseDia + 0.02) * (vizLane[rpt] as NoteMeta).velocity_coeff, 0, 360);

      // inner colored circle
      sketch.glcolor(color.r, color.g, color.b, 1.0);
      sketch.circle((vizLane[rpt] as NoteMeta).velocity_coeff * baseDia, 0, 360);
    }
  }

  // Add some informational text
  var lastTap = noteRepeats[noteRepeats.length - 1];
  outlet(OUTLET_TOTAL_NOTES, noteRepeats.length);

  let maxDur = 0
  for (const nr of noteRepeats) {
    let dur = nr.ms + nr.duration
    if (dur > maxDur) {
      maxDur = dur
    }
  }
  outlet(OUTLET_TOTAL_DURATION, Math.floor(maxDur));

  //if (noteRepeats.length > 0) {
  //  sketch.moveto(xMin - baseDia, yMax);
  //  sketch.textalign("left");
  //  
  //  sketch.glcolor(1,1,1,1); // white text
  //  sketch.text(noteRepeats.length + " Notes // Total " + parseInt(lastTap.ms + lastTap.duration)/1000 + " seconds");
  //}
}

// Utility to scale a value from one range to another
function scale(val: number, valMin: number, valMax: number, outMin: number, outMax: number) {
  var valRange = valMax - valMin;

  // if there is no input range, then return the output minimum
  if (valRange === 0) { return outMin; }

  var outRange = outMax - outMin;
  var scaler = outRange / valRange;

  // y = mx + b, yo
  return (scaler * val) + outMin;
}
