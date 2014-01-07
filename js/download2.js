var dlMethod
	, dl_maxSlots = 4
	, dl_legacy_ie = (typeof XDomainRequest != 'undefined') && (typeof ArrayBuffer == 'undefined')
	, dl_maxchunk = 16*1048576
	, dlQueue = new QueueClass(downloader)
	, dlDecrypter = new QueueClass(decrypter)

if (localStorage.dl_maxSlots) {
	dl_maxSlots = localStorage.dl_maxSlots;
}

/**
 *	DownloadQueue
 *	
 *	Array extension to override push, so we can easily
 *	kick up the download (or queue it) without modifying the
 *	caller codes
 */
function DownloadQueue() {
}
inherits(DownloadQueue, Array);

DownloadQueue.prototype.getUrls = function(dl_chunks, dl_chunksizes, url) {
	var dl_urls = []
	$.each(dl_chunks, function(key, pos) {
		dl_urls.push({
			url: url + '/' + pos + '-' + (pos+dl_chunksizes[pos]-1),
			size: dl_chunksizes[pos],
			offset: pos
		})
	});

	return dl_urls;
}

DownloadQueue.prototype.splitFile = function(dl_filesize) {
	var dl_chunks = []
		, dl_chunksizes = []
	
	var p = pp = 0;
	for (var i = 1; i <= 8 && p < dl_filesize-i*131072; i++) {
		dl_chunksizes[p] = i*131072;
		dl_chunks.push(p);
		pp = p;
		p += dl_chunksizes[p];
	}

	while (p < dl_filesize) {
		dl_chunksizes[p] = Math.floor((dl_filesize-p)/1048576+1)*1048576;
		if (dl_chunksizes[p] > dl_maxchunk) dl_chunksizes[p] = dl_maxchunk;
		dl_chunks.push(p);
		pp = p;
		p += dl_chunksizes[p];
	}

	if (!(dl_chunksizes[pp] = dl_filesize-pp)) {
		delete dl_chunksizes[pp];
		delete dl_chunks[dl_chunks.length-1];
	}

	return {chunks: dl_chunks, offsets: dl_chunksizes};
}

DownloadQueue.prototype.push = function() {
	var pos = Array.prototype.push.apply(this, arguments)
		, id = pos -1
		, dl  = this[id]
		, dl_id  = dl.ph || dl.id
		, dl_key = dl.key
		, dl_retryinterval = 1000
		, dlObject = new dlMethod(dl.ph || dl.id, dl, dl_id)
		, dl_keyNonce = JSON.stringify([dl_key[0]^dl_key[4],dl_key[1]^dl_key[5],dl_key[2]^dl_key[6],dl_key[3]^dl_key[7],dl_key[4],dl_key[5]])
		, dl_urls = []

	dl.pos   = id // download position in the queue
	dl.dl_id = dl_id;  // download id
	dl.io    = dlObject;
	dl.nonce = dl_keyNonce
	dl.progress = 0;
	dl.macs  = {}

	dlObject.begin = function() {
		var tasks = [];
		$.each(dl_urls||[], function(pos, url) {
			tasks.push({url: url.url, pos: url.offset, size: url.size, io: dlObject , download: dl});
		});

		dlQueue.pushAll(tasks, function() {
			dl.onDownloadComplete(dl_id);
			dl.onBeforeDownloadComplete(dl.pos);
			dl.io.download(dl.n, dl.p);
		});

		// notify the UI
		dl.onDownloadStart(dl.dl_id, dl.n, dl.size, dl.pos);
	}

	DEBUG("dl_key " + dl_key);

	function dlHandler (res, ctx) {
		if (typeof res == 'object') {
			res = res[0];
			if (typeof res == 'number') {
				dl_reportstatus(dl_id, res.d ? 2 : 1)
			} else {
				if (res.d) {
					dl_reportstatus(dl_id, res.d ? 2 : 1)
				} else if (res.g) {
					var ab = base64_to_ab(res.at)
						, o = dec_attr(ab ,[dl_key[0]^dl_key[4],dl_key[1]^dl_key[5],dl_key[2]^dl_key[6],dl_key[3]^dl_key[7]]);

					if (typeof o == 'object' && typeof o.n == 'string') {
						var info = dl_queue.splitFile(res.s);
						dl_urls = dl_queue.getUrls(info.chunks, info.offsets, res.g)
						if (have_ab && res.pfa && res.s <= 48*1048576 && is_image(o.n) && (!res.fa || res.fa.indexOf(':0*') < 0))  {
							dl_queue[dl_queue_num].data = new ArrayBuffer(res.s);
						} else {
							return dlObject.setCredentials(res.g, res.s, o.n, info.chunks, info.offsets);
						}
					} else {
						dl_reportstatus(dl_id, EKEY);
					}
				} else {
					dl_reportstatus(dl_id, res.e);
				}
			}
		}

		dl_retryinterval *= 1.2;
		// Do not use dl_settimer, better use
		// a private timeout function
		setTimeout(function() {
			dlGetUrl(dl, dlHandler);
		}, dl_retryinterval);
	}
	
	dlGetUrl(dl, dlHandler);

	return pos;
};

function dlGetUrl(id, callback) {
	var object = dl_queue[id] ? dl_queue : id
		, req = { 
			a : 'g', 
			g : 1, 
			ssl : use_ssl,
		};

	if (object.ph) {
		req.p = object.ph;
	} else if (object.id) {
		req.n = object.id;
	}

	api_req([req], {callback:callback});
}

if (window.webkitRequestFileSystem) {
	dlMethod = FileSystemAPI;
} else {
	alert("dlMethod is not yet defined");
}

// check if the download method works
// and boot everything!
dlMethod.check(function() {
	//
});
