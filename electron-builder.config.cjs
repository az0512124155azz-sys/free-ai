const pkg=require('./package.json');

const build=JSON.parse(JSON.stringify(pkg.build||{}));

const azureSignFields={
  publisherName:String(process.env.WIN_AZURE_SIGN_PUBLISHER||'').trim(),
  endpoint:String(process.env.WIN_AZURE_SIGN_ENDPOINT||'').trim(),
  codeSigningAccountName:String(process.env.WIN_AZURE_SIGN_ACCOUNT||'').trim(),
  certificateProfileName:String(process.env.WIN_AZURE_SIGN_PROFILE||'').trim()
};
const azureSignConfigured=Object.values(azureSignFields).every(Boolean);
if(azureSignConfigured){
  build.win={
    ...(build.win||{}),
    azureSignOptions:{
      ...azureSignFields,
      fileDigest:'SHA256',
      timestampDigest:'SHA256',
      timestampRfc3161:'http://timestamp.acs.microsoft.com'
    }
  };
}

build.mac={
  ...(build.mac||{}),
  notarize:String(process.env.FREEAI_MAC_NOTARIZE||'').toLowerCase()==='true'
};

module.exports=build;
