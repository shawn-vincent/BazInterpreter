
/*
 * baz-interpreter.js
 *
 * A simple FRP runtime to experiment with languages.
 *
 * 2014 - Shawn Vincent - svincent@svincent.com
 *
 */


var Baz = {};




/* Simple JavaScript Inheritance
 * By John Resig http://ejohn.org/
 * MIT Licensed.
 */
// Inspired by base2 and Prototype
(function(){
  var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;
 
  // The base Class implementation (does nothing)
  this.Class = function(){};
 
  // Create a new Class that inherits from this class
  Class.extend = function(prop) {
    var _super = this.prototype;
   
    // Instantiate a base class (but only create the instance,
    // don't run the init constructor)
    initializing = true;
    var prototype = new this();
    initializing = false;
   
    // Copy the properties over onto the new prototype
    for (var name in prop) {
      // Check if we're overwriting an existing function
      prototype[name] = typeof prop[name] == "function" &&
        typeof _super[name] == "function" && fnTest.test(prop[name]) ?
        (function(name, fn){
          return function() {
            var tmp = this._super;
           
            // Add a new ._super() method that is the same method
            // but on the super-class
            this._super = _super[name];
           
            // The method only need to be bound temporarily, so we
            // remove it when we're done executing
            var ret = fn.apply(this, arguments);        
            this._super = tmp;
           
            return ret;
          };
        })(name, prop[name]) :
        prop[name];
    }
   
    // The dummy class constructor
    function Class() {
      // All construction is actually done in the init method
      if ( !initializing && this.init )
        this.init.apply(this, arguments);
    }
   
    // Populate our constructed prototype object
    Class.prototype = prototype;
   
    // Enforce the constructor to be what we expect
    Class.prototype.constructor = Class;
 
    // And make this class extendable
    Class.extend = arguments.callee;
   
    return Class;
  };
})()
;



// -------------------------------------------------------------------------
// World

Baz.World = Class.extend ({
    init:function () {
        this.globalEventId = 0;
        
        this.lastEventSignal = null;
        this.lastEventArg = null;
        
        this.subscribedSignals = [];
    },

    fireEvent: function(eventSignal, eventArg) {

        this.globalEventId++;
        this.lastEventSignal = eventSignal;
        this.lastEventArg = eventArg;
        
        // recalculate everything that's been subscribed to.
        // XXX this doesn't guarantee order.  Should sort based on dependencies...
        for (var i=0, len=this.subscribedSignals.length; i<len; i++) {
            var s = this.subscribedSignals[i];
            s.calcValue(this);
        }
    }
});



// -------------------------------------------------------------------------
// Signals


Baz.NeverRun = ["_NeverRun"];
Baz.GlobalSignalId = 0;

Baz.Signal = Class.extend({

    /**
     * Construct a new Signal with a given Javascript fn to evaluate to
     * calculate the new value.
     *
     **/
    init:function(_world, _tag, _inputSignals, _fn) {
        this.id = Baz.GlobalSignalId++;
        
        this.world = _world;

        this.tag = _tag; // for debugging.
        
        this.isInput = false;
        this.inputSignals = _inputSignals;
        
        this.fn = _fn;
        
        this.cachedResult = Baz.NeverRun;
        this.dependsOnInputIds = [];
        this.lastRunForGlobalEventId = -1;
        
        this.subscribers = [];
    },

    setIsInput: function() {
        this.isInput = true;
    },

    subscribe: function(fn) {
        this.subscribers.push(fn);
        // XXX only add if not already there.
        this.world.subscribedSignals.push(this);
    },
    unsubscribe: function(fn) {
        throw new Error("not implemented");
    },
    
    /**
     * Calculate the current value of this signal.
     *
     * Fires subscribers and updates dependencies.
     **/
    calcValue: function(world) {
        
        // try cached version
        
        // if we've never run, no point in checking cache.
        if (this.cachedResult !== Baz.NeverRun) {
            
            // if we've run already for this transaction, we're done.
            if (this.lastRunForGlobalEventId >= world.globalEventId)
                return this.cachedResult;
            
            // if we don't depend on the input signal, we're done.
            if (this.dependsOnInputIds.indexOf(world.lastEventSignal.id) == -1)
                return this.cachedResult;
        }

        // calculate the function arguments.
        var args = [];
        args.push(world);
        for (var i=0, len=this.inputSignals.length; i<len; i++) {
            var s = this.inputSignals[i];
            args.push(s);
        }

        // run it.
        var result = this.fn.apply(this, args);

        
        // calculate our new dependencies.
        this.dependsOnInputIds = [];
        if (this.isInput)
            this.dependsOnInputIds.push(this.id);
        for (var i=0, len=this.inputSignals.length; i<len; i++) {
            var s = this.inputSignals[i];
            // add our leaf dependencies on this one.
            Array.prototype.push.apply (this.dependsOnInputIds,
                                        s.dependsOnInputIds);
        }

        // we've just recalculated.  Update our transaction id.
        this.lastRunForGlobalEventId = world.globalEventId;
        
        // fire subscribers if we have a new result.
        if (this.cachedResult !== result) {
            for (var i=0, len=this.subscribers.length; i<len; i++) {
                var subFn = this.subscribers[i];
                subFn.call(subFn, result);
            }
        }
        
        // update cached result.
        this.cachedResult = result;
        
        return result;
    }
});

Baz.InputSignal = Baz.Signal.extend({
    init:function(_world, _tag, _inputSignals, _fn) {
        this._super(_world, _tag, _inputSignals, _fn);
        this.setIsInput();
    }
});

// -------------------------------------------------------------------------
// Signal constructors (experiment)


/** Constant value */
function makeConstantSignal(world, v) {
    return new Baz.Signal(world, "constant("+v+")", [],
                          function(world) {
                              return v;
                          });
}

/** Lambda */
function makeLambdaSignal(world, closureState, fn) {
    /*
      An example lambda.

      Consider the case where the lambda has closure state.  In this
      case, the lambda itself depends on that closure state, and the
      lambda Signal needs to be recalculated if that closure state
      changes.
     */
    return new Baz.Signal(world, "lambda "+fn, closureState,
                          function(world) {
                              // could be a fancier lambda.
                              // XXX apply closure state here.
                              return fn;
                          });
}

/** Apply */
function makeApplySignal(world, fn, args) {

    return new Baz.Signal(world, "apply/"+args.length, [fn].concat(args),
                   function(world, fn /*, arg...*/) {

                       var args = [];
                       for (var i=2, len=arguments.length; i<len; i++) {
                           var arg = arguments[i];
                           args.push(arg.calcValue(world));
                       }

                       return fn.calcValue(world).apply (null,args);
                   });
}

function makeIfSignal(world, cond, thenVal, elseVal) {
 
    return new Baz.Signal(world, "if", [cond, thenVal, elseVal],
                          function(world, cond, thenVal, elseVal) {
                              if (cond.calcValue(world)) {
                                  return thenVal.calcValue(world);
                              } else {
                                  return elseVal.calcValue(world);
                              }
                          });
}


/** Convenience: lambda + apply */
function makeCallSignal(world, fn, args) {

    var fnSignal = makeLambdaSignal(world, [], fn); // no closure.

    var applySignal = makeApplySignal(world, fnSignal, args);

    return applySignal;
}


/** Convenience: makeCall to concat function */
function makeCallConcatSignal(world, signalsList) {

    return makeCallSignal(world, 
                          function(/*value...*/) {
                              var r = "";
                              for (var i=0, len=arguments.length; i<len; i++) {
                                  var value = arguments[i];
                                  r+="<div>"+ value+ "</div>";
                              }
                              return r;
                          },
                          signalsList);
}





// -------------------------------------------------------------------------
// Test code


function test1(world, time) {
    var sig =
        new Baz.Signal(world, "x/1000%10 + x/1000%10", [time, time], 
                       function(world, a, b) {
                           var a_ = Math.floor(a.calcValue(world) / 1000) % 10;
                           var b_ = Math.floor(b.calcValue(world) / 1000) % 10;
                           return a_+"+"+b_+"="+(a_+b_); 
                       });

    return sig;
}

function testLambda(world, time) {
    var two = makeConstantSignal(world, 2);
    return makeCallSignal(world, function(a,b) {return a*b;}, [two, time]);
}

function testIf(world, time) {

    var cond =
        new Baz.Signal(world, "x/1000%2==0", [time],
                       function(world, time) {
                           // in practice would be several Signals.
                           var r = Math.floor(time.calcValue(world) / 1000) % 2;

                           return r === 0;
                       });

    var thenVal = makeConstantSignal(world, "Is even");
    var elseVal = makeConstantSignal(world, "Is odd");
    var ifVal = makeIfSignal(world, cond, thenVal, elseVal);
    return ifVal;
}

function testConstant(world, time) {
    return makeCallSignal(world, function(a,b) {return a*b;}, 
                          [makeConstantSignal(world, 2),
                           makeConstantSignal(world, 2)]);
}


function testBaz() {
    var world = new Baz.World();

    var time =
        new Baz.InputSignal(world, "time", [], 
                            function(world) {
                                return new Date().getTime();
                            });


    var sig=makeCallConcatSignal(world,
                                 [testLambda(world, time),
                                  testIf(world,time),
                                  test1(world,time),
                                  testConstant(world,time)]);
    

    sig.subscribe(function(value) {
        document.getElementById("output").innerHTML = value;
    });

    var trace =
        new Baz.Signal(world, "trace", [sig],
                       function(world, sig) {
                           var r = generateTrace(world, sig);
                           return r;
                       });


    trace.subscribe(function(value) {
        document.getElementById("trace").innerHTML = value;
    });

    // XXX fake out event.
    
    window.setInterval(function() {
        world.fireEvent(time, null);
    }, 1);
}




function generateTrace (world, sig) {

    var r = "";

    r+= "<ul>";
    
    // ensure that the value is calculated.
    r+= "<li><span class='signalTag'>"+sig.tag+"</span> = "
        +"<span class='signalValue'>"+sig.cachedResult+"</span>" +
        "<span class='details'>inputIds="+
        sig.dependsOnInputIds+
        "</span>";
    
    for (var i=0, len=sig.inputSignals.length; i<len; i++) {
        var s = sig.inputSignals[i];
        r+= generateTrace(world, s);
    }


    r+= "</li>";
    
    r+= "</ul>";

    return r;
}


// -------------------------------------------------------------------------
// Utility functions.




function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


