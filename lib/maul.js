var jsp = require("./parse-js"),
    pro = require("./process"),
    slice = jsp.slice,
    MAP = pro.MAP;

var base52 = (function(){
    var DIGITS = "etnrisouaflchpdvmgybwESxTNCkLAOMDPHBjFIqRUzWXVJKQGYZ0516372984";
    return function(num) {
        var ret = "", base = 52;
        do {
            ret += DIGITS.charAt(num % base);
            num = Math.floor(num / base);
            base = 62;
        } while (num > 0);
        return ret;
    };
})();

function HOP(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

function ast_maul(ast, options) {
    options = options || {};
    options.state = options.state || {};
    options.state.maul = options.state.maul || {};

    var w                    = pro.ast_walker(),
        walk                 = w.walk,
        index                = options.startIndex || 0,
        endIndex             = options.endIndex || Infinity,  
        indexCount           = 0,
        map                  = options.state.maul.map || { },
        previous_map         = options.previous_map || { },
        reverse_map          = { },
        previous_reverse_map = { },
        used_symbols         = { },
        new_symbols          = { },
        string_literals      = { },
        object_literals      = { },
        result;

    for (var i in map) { if (HOP(map, i)) {
        reverse_map[map[i]] = i;
    } }

    for (var i in previous_map) { if (HOP(previous_map, i)) {
        previous_reverse_map[previous_map[i]] = i;
    }}

    var ignore = jsp.array_to_hash((options.except || [ ]).concat([
        "this", "E", "NaN", "Infinity", "Object", "Function", "Array", "String",
        "Boolean", "Number", "Date", "RegExp", "Error", "EvalError",
        "RangeError", "ReferenceError", "SyntaxError", "TypeError",
        "URIError", "Math", "JSON"
    ]));

    function add_hash_to_ignore(hash) {
        if (!hash) return;
        for (var i in hash) { if (HOP(hash, i)) {
            ignore[i] = true;
        } }
    }

    add_hash_to_ignore(options.defines);
    add_hash_to_ignore(jsp.KEYWORDS_ATOM);
    add_hash_to_ignore(jsp.RESERVED_WORDS);
    add_hash_to_ignore(jsp.KEYWORDS);

    function get_mauled_symbol(name) {
        var symbol;

        if (Array.isArray(name)) {
            if (name.length != 1) {
                throw new Error("ast_maul(): array passed into get_mauled_symbol() with length != 1");
            }

            name = name[0];
        }

        // map is the map made by our parent dependency during *this* compilation 
        //
        if (HOP(map, name)) {
            symbol = map[name];
            used_symbols[symbol] = name;

        } else if (!HOP(ignore, name)) {

            // previous_map is the map made by this file during a previous compilation
            // It's intended to keep mauled symbols the same between compiles (when possible)
            //
            if (HOP(previous_map, name)) {
                symbol = previous_map[name];

                if (HOP(ignore, symbol) || HOP(reverse_map, symbol)) {
                    symbol = undefined;
                }
            }

            if (!symbol) {
                for (;;) {
                    symbol = "$" + base52(index++);
                    indexCount++;

                    if (index >= endIndex) {
                        throw new Error("ast_maul(): ran out of indices in get_mauled_symbol()");
                    }

                    if (!HOP(ignore, symbol) && !HOP(reverse_map, symbol) && !HOP(previous_reverse_map, symbol)) break;
                }
            }

            reverse_map[symbol]  = name;
            new_symbols[symbol]  = name;
            used_symbols[symbol] = name;
            map[name] = symbol;
        }

        return symbol ? symbol : name;
    }

    function _vardefs(defs) {
        return [ this[0], MAP(defs, function(d){
            return [ get_mauled_symbol(d[0]), walk(d[1]) ];
        }) ];
    }

    function _lambda(name, args, body) {
        args = MAP(args, function(name) { return get_mauled_symbol(name) });
        return [ this[0], get_mauled_symbol(name), args.slice(), MAP(body, walk) ];
    }

    function hash_concat(a, b) {
        var a_keys = Object.keys(a || { }),
            b_keys = Object.keys(b || { });

        return jsp.array_to_hash(a_keys.concat(b_keys));
    }

    result = w.with_walkers({
        "const":    _vardefs,
        "var":      _vardefs,
        "defun":    _lambda,
        "function": _lambda,

        "dot": function(expr) {
            var name        = slice(arguments, 1),
                mauled_name = get_mauled_symbol(name);

            if (name != mauled_name) {
                object_literals[name] = true;
            }

            return [ this[0], walk(expr) ].concat(get_mauled_symbol(name));
        },

        "sub": function(expr, subscript) {
            if (subscript[0] == "string") {
                string_literals[subscript[1]] = true;
            }

            return [ this[0], walk(expr), walk(subscript) ];
        },

        "try": function(t, c, f) {
            return [
                this[0],
                MAP(t, walk),
                c != null ? [ get_mauled_symbol(c[0]), MAP(c[1], walk) ] : null,
                f != null ? MAP(f, walk) : null
            ];
        },

        "name": function(name) {
            return [ this[0], get_mauled_symbol(name) ];
        },

        "object": function(props) {
            return [ this[0], MAP(props, function(p) {
                var key = p[0], name;
                if (key[0] == "string") {
                    name = key[1];
                    string_literals[name] = true;
                } else {
                    name = get_mauled_symbol(key);
                    if (name != key) {
                            object_literals[key] = true;
                    }
                }
                return p.length == 2
                    ? [ name, walk(p[1]) ]
                    : [ name, walk(p[1]), p[2] ]; // get/set-ter
            }) ];
        }
    }, function(){ return walk(ast) });


    if (options.make_reserved) {
        var i, lines = [ ];
        for (i in map) { if (HOP(map, i)) { lines.push(i); } }
        result = lines.sort().join("\n");
    }

    var all_string_literals = hash_concat(options.state.maul.all_string_literals, string_literals),
        all_object_literals = hash_concat(options.state.maul.all_object_literals, object_literals),
        conflicts = { };

    function check_literals(all, local) {
        for (var literal in all) { if (HOP(all, literal)) {
            if (HOP(local, literal)) {
                conflicts[literal] = true;
            }
        } }
    }

    check_literals(all_string_literals, object_literals);
    check_literals(all_object_literals, string_literals);

    options.state.maul = {
        all_string_literals: all_string_literals,
        all_object_literals: all_object_literals,
        conflicts: Object.keys(conflicts).sort(),
        count: indexCount,
        new_symbols: new_symbols,
        used_symbols: used_symbols,
        map: map
    };

    return result;
};

exports.ast_maul = ast_maul;

// Local variables:
// js-indent-level: 4
// End:
