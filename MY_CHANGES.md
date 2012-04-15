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

Enter the Mauler addition to UglifyJS.  