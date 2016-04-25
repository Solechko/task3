var CACHE_NAME = 'shri-2016-task3-1';
var urlsToCache = [
   '/',
   '/css/index.css',
   '/js/index.js'
];

self.addEventListener('install', (event) => {    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {                
                return cache.addAll(urlsToCache);
            })
    );    
});

self.addEventListener('fetch', function(event) {
    const requestURL = new URL(event.request.url);

    if (/^\/api\/v1/.test(requestURL.pathname)
        && (event.request.method !== 'GET' && event.request.method !== 'HEAD')) {
        return event.respondWith(fetch(event.request));
    }

    if (/^\/api\/v1/.test(requestURL.pathname)) {        
        console.log('***************************');
        return event.respondWith(
            fetchAndPutToCache(event.request).catch(function() {
                getFromCache(event.request);
            })              
        );
    }

    return event.respondWith(
        getFromCache(event.request).catch(function() {             
            fetchAndPutToCache(event.request); 
        })
    );
});

function fetchAndPutToCache(request) {    
    console.log('fetchAndPutToCache ' + request.url);
    return fetch(request).then((response) => {
        const responseToCache = response.clone();
        return caches.open(CACHE_NAME)
            .then((cache) => {
                cache.put(request, responseToCache);                
            })
            .then(() => response);
    })
    .catch(() => caches.match(request));
}

function getFromCache(request) {
    console.log('getFromCache ' + request.url);
    return caches.match(request)
        .then((response) => {
            if (response) {
                return response;
            }            
            console.log('Rejected getFromCache ' + request.url);
            return Promise.reject();
        });
}
