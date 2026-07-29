" Ref decorations on log commit lines, e.g. (HEAD -> main, tag: v1.0, origin/main),
" which the stock git syntax leaves unhighlighted.
" At equal start positions the last-defined rule wins, so these go generic to specific.
syn match gitLogBranch /[^ ,()]\+/ contained
syn match gitLogRemote /[^ ,()]\+\/[^ ,()]\+/ contained
syn match gitLogTag /tag: [^,)]\+/ contained
syn match gitLogArrow /->/ contained
syn match gitLogHead /\<HEAD\>/ contained
" Lookbehind instead of \zs: the line start is already consumed by gitKeyword and
" gitHashAbbrev, and contained matches are only attempted at unconsumed positions.
syn match gitLogRefs /\%(^[*|\/\\_ ]*commit\%( \x\{4,\}\)\{1,\}\s*\)\@<=(.*)$/ contained containedin=gitHead,gitGraph contains=gitLogHead,gitLogArrow,gitLogTag,gitLogRemote,gitLogBranch

hi def link gitLogRefs   gitReference
hi def link gitLogArrow  gitLogRefs
hi def link gitLogHead   gitReference
hi def link gitLogBranch gitReference
hi def link gitLogRemote gitReference
hi def link gitLogTag    gitReference
