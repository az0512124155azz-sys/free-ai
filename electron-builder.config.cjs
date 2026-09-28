const pkg=require('./package.json');

const build=JSON.parse(JSON.stringify(pkg.build||{}));
build.mac={
  ...(build.mac||{}),
  notarize:String(process.env.FREEAI_MAC_NOTARIZE||'').toLowerCase()==='true'
};

module.exports=build;
