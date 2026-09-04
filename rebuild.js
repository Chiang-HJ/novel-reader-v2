const fs = require('fs');
let c = fs.readFileSync('src/context/TwitterDownloadContext.js', 'utf8');
let lines = c.split('\n');

const correctBlock = \                        const type = isImage ? 'image' : 'video';

                        const uniqueId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
                        const fileName = uniqueId + '_twitter' + ext;
                        const destUri = vaultDir + fileName;

                        const downloadResumable = FileSystem.createDownloadResumable(fileUrl, destUri, {}, (prog) => {
                            setTwitterProgressText(\\\下載進度 \/\: \%\\\);
                        });
                        const downloadResult = await downloadResumable.downloadAsync();
                        if (!downloadResult || downloadResult.status !== 200) continue;

                        let thumbnailUri = null;
                        if (type === 'video') {
                            try {
                                const { uri: tUri } = await VideoThumbnails.getThumbnailAsync(destUri, { time: 1000 });\;

// Replace lines 109 to 110 (which are 108 and 109 in zero-indexed)
// Note: we can just reconstruct the file.
// The file is small enough. Let's write the whole file!
