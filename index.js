var fs = require('fs')
var tgz = require('tar.gz')
var mkdirp = require('mkdirp')
var Path = require('path')
var glob = require('glob')
var semver = require('semver')
var async = require('async')
var _ = require('underscore')

var cwd = process.cwd()

var pkgjson = require(Path.join(cwd, 'package.json'))
var modulePath = Path.join(cwd, '.modules')

var sep = '-v'

// ensure that the .modules directory exists
mkdirp.sync(modulePath)


var log = function() {
  console.log.apply(console, arguments)
}

var error = function() {
  console.error.apply(console, arguments)
}

var tryRequire = function(p) {
  try {
    return require(p)
  } catch(ex) {
    error('Failed to load', p)
  }
  return null
}

var pack = function(name, version, cb) {
  log('Packing', name+sep+version)
  var source = Path.join(cwd, 'node_modules', name)
  var dest = Path.join(modulePath, name+sep+version+'.tgz')
  new tgz().compress(source, dest, function(err) {
    if (err)
      error('Failed to pack', name)
    else
      log('Packed', name)
    cb()
  })
}


var filesToHash = function(files) {
  return files
}

// get a list of all the currently created files and
// separate the file list into a hash of name/version
var curMods = glob.sync('*.tgz', {cwd:modulePath}).reduce(function(memo, file) {
  file = file.replace(/\.tgz$/i, '')
  var name = file.substring(0, file.lastIndexOf(sep))
  var version = file.substring(file.lastIndexOf(sep)+sep.length)
  memo[name] = version
  return memo
}, {})

// get dependency list
var deps = pkgjson.dependencies

// get a list of currently installed node_modules
var curInst = glob.sync('node_modules/*/package.json', {cwd:cwd}).reduce(function(memo, file) {
  file = Path.join(cwd, file)
  var pkg = require(file)
  memo[pkg.name] = pkg.version
  return memo
}, {})


// remove any packed modules that are not in the dependencies list
_.difference(Object.keys(curMods), Object.keys(deps)).forEach(function(name) {
  var fv = name+sep+curMods[name]
  log('Module ', fv, 'is not in the dependencies list, removing it.')
  fs.unlinkSync(Path.join(modulePath, fv+'.tgz'))
})

// warn about missing deps
_.difference(Object.keys(deps), Object.keys(curInst)).forEach(function(name) {
  error('WARNING:', name, 'is not installed!')
})


// Updated any dependencies that have different versions
// and pack any that are missing completely
async.eachSeries(Object.keys(curInst), function(name, cb) {
  if (!deps[name]) return cb()
  if (curInst[name] === curMods[name]) return cb()
  if (!curMods[name]) {
    log('Adding', name+sep+curInst[name])
  }
  if (curMods[name] && curInst[name] !== curMods[name]) {
    log('Module', name, 'has changed from ', curMods[name], 'to', curInst[name])
    fs.unlinkSync(Path.join(modulePath, name+sep+curMods[name]+'.tgz'))
  }
  return pack(name, curInst[name], cb)
})




// // remove any packed modules that aren't needed
// // or don't meet version requirements
// Object.keys(curMods).forEach(function(name) {
//   if (!deps[name] || !semver.satisfies(curMods[name], deps[name])) {
//     var fv = name+sep+curMods[name]
//     log('Removing ', fv)
//     fs.unlinkSync(Path.join(modulePath, fv+'.tgz'))
//     delete curMods[name]
//   }
// })

// // figure out what modules need packing up and pack them
// async.eachSeries(Object.keys(deps), function(name, cb) {
//   var needs = deps[name]
//   if (!curMods[name]) {
//     var pkg = tryRequire(Path.join(cwd, 'node_modules', name, 'package.json'))
//     if (pkg) {
//       return pack(name, pkg.version, cb)
//     }
//     error('Unmet dependency', name+sep+needs)
//   }
//   cb()
// })
