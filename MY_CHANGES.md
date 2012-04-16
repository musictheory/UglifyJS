# musictheory.net changes to UglifyJS

* Added `ast_maul`, which implements global name mangling (see description below)
* Pulled https://github.com/mishoo/UglifyJS/pull/316 from [laverdet](https://github.com/laverdet) 
* Incremented stack size in uglifyjs to 8MB, due to errors when parsing large JS files
* Modified base54().  mangler passes in `isGlobal=false`, which starts the name with `[a-z]`.
  Mauler uses `isGlobal=true`, which starts the name with `[A-Z]`.  `[$_]` are no longer used to begin names.

-----

# Mauler Design

musictheory.net has three main JS modules: a library of core functions (similar to Prototype.js or underscore.js), a library for UI widgets, and a library for shared exercise code.  Consolidation into one JS file is not possible due to bandwidth concerns.

Exercises on the site require all three libraries.  Lessons and tools need only the Core and UI modules.  The rest of the site just needs Core.

In visual form, the dependency tree looks like this:

Google's Closure Compiler requires that manual exports and imports be set up between each module.  This was not acceptable for our needs.

Enter the Mauler addition to UglifyJS.  When `--maul` is specified as a command-line option to `uglifyjs`, `ast_maul` is ran on the AST prior to `ast_mangle`.  Maul performs the following transformations:

1. All names are transformed to a (hopefully shorter) mauled name form consisting of `[A-Z]`, followed by `[A-Za-z_$]?`.  This affects  function names, variable names, dot-syntax references, and object literal keys.
2. The mapping of name to mauled name is global and persistent.  Once the name `Foo` is mapped to the mauled `Aa`, all references of `Foo`, regardless of scope, become `Aa`.  `Aa` will never be reused for another name.
3. **Mappings may be shared among modules using  `--maul-input-symbol-list` and `--maul-output-symbol-list`.**
4. Like Closure, string literals are never changed.  Refer to [Inconsistent Property Names](https://developers.google.com/closure/compiler/docs/api-tutorial3#propnames) for more information.
5. A list of names to ignore and never maul may be specified using `--maul-ignore-list`. 