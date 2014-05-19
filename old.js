
var LambdaTag = "_lambda";
var ApplyTag = "_apply";
var RefTag = "_ref";


/*
 * Types of expressions.
 */
var fn = [LambdaTag, ["parm", "parm", "parm"], []/*expr*/];
var apply = [ApplyTag, fn, ["arg", "arg", "arg"]];
var ref = [RefTag, "varName"];

/**
 * Evaluate an expression in a scope.
 **/
function eval(expr, scope) {
    // allow constant values through.
    if (!Array.isArray(expr))
	return expr;

    switch(expr[0]) {

    case LambdaTag:
	// make lambda
	return new Lambda(expr[1], expr[2]);

    case ApplyTag:
	// evaluate arguments (consider Vau)
	var args = [];
	for (argExpr in expr[2]) args.push(eval(argExpr, scope));

	// evaluate lambda
	var lambda = eval(expr[1], scope);

	// apply lambda
	return lambda.apply(args, scope);

    case RefTag:
	// 
	return scope[expr[1]];

    default:
	throw new Error("Assertion failed: Unknown expression tag: "+expr[0]);
    }
}


function Lambda(_parms, _expr) {
    this.parms = _parms;
    this.expr = _expr;
}

Lambda.prototype.apply = function(args) {
    return eval(this.expr, args);
}



// -------------------------------------------------------------------------
