import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from './s3Client';
import { BucketParams } from '../@types/bot/BucketParams';

// Create and upload the object to the S3 bucket.
const s3PutCommand = async (params: BucketParams) => {
	try {
		const data = await s3Client.send(new PutObjectCommand(params));
		console.log('Successfully uploaded object: ' + params.Bucket + '/' + params.Key);
		return data;
	}
	catch (err) {
		console.log('s3 Put Command Failed');
		console.log('Error', err);
	}
};

export {
	s3PutCommand,
};

