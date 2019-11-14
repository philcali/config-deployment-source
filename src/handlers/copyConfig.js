const archiver = require('archiver');
const AWS = require('aws-sdk');
const { Stream } = require('stream');

const ssm = new AWS.SSM();
const s3 = new AWS.S3();
const NAME_PREFIX = process.env.NAME_PREFIX;
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;

exports.index = (event, context, callback) => {
  let config = {};
  let path = '/' + NAME_PREFIX.replace(/\*$/, '').replace(/^\//, '');
  let regex = new RegExp(NAME_PREFIX.replace('*', '.+'), 'g');
  if (event.detail.name.match(regex)) {
    console.log(`Matches ${event.detail.name} matches ${path}`);
    let listParams = input => {
      ssm.getParametersByPath(input, (err, resp) => {
        if (err) {
          callback(err);
        } else {
          resp.Parameters.forEach(param => {
            let value = param.Value;
            if (param.Type == 'StringList') {
              value = value.split(/\s*,\s*/);
            }
            config[param.Name.replace(path, '')] = value;
          });
          if (resp.NextToken) {
            listParams({ Path: path, NextToken: resp.NextToken});
          } else {
            let streamPassThrough = new Stream.PassThrough();
            let archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(streamPassThrough);
            archive.append(Buffer.from(JSON.stringify(config)), {
              name: 'config.json'
            });
            archive.finalize();
            let putRequest = {
              Bucket: DESTINATION_BUCKET,
              Key: "configuration.zip",
              ContentType: 'application/zip',
              Body: streamPassThrough
            };
            let s3Upload = s3.upload(putRequest);
            s3Upload.on('end', () => callback(null, 'Ended'));
            s3Upload.on('close', () => callback(null, 'Closed'));
            s3Upload.on('error', callback);
            s3Upload.promise().then(() => callback(null, 'Finished'));
          }
        }
      });
    };
    listParams({ Path: path });
  } else {
    callback(null, "Skipped!");
  }
}
