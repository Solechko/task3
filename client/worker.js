var CACHE_NAME = 'shri-2016-task3-1';
var urlsToCache = [
   '/',
   '/css/index.css',
   '/js/index.js'
];
var studentsRequest;    // сохраненный запрос для получения студентов; используется для обновления в кэше ответа при добавлении студентов в оффлайн
var offlineAdded;       // признак наличия в кэше студентов, добавленных в офлайн

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

    // сохранение request для GET запроса получения студентов
    if (/^\/api\/v1/.test(requestURL.pathname) && (event.request.method === 'GET')) {
        studentsRequest = event.request.clone();
    }

    if (/^\/api\/v1/.test(requestURL.pathname) && (event.request.method !== 'GET' && event.request.method !== 'HEAD')) {
        return event.respondWith(        
            getOnlineState().then((state) => {      // получение текущего состояния сервера - онлайн/оффлайн           
                console.log(event.request);
                if ( state === true ) {
                    return fetch(event.request);
                } else {
                    // добавление или обновление студента в оффлайн режиме
                    return addOrModifyStudentOffline(studentsRequest, event.request);
                } 
            })
        );
    }

    if (/^\/api\/v1/.test(requestURL.pathname)) {
        return event.respondWith(                    
            getOnlineState().then((state) => {              // получение текущего состояния сервера - онлайн/оффлайн
                if ( state === false ) {
                    return getFromCache(event.request);
                } else if (offlineAdded === true) {         // если сейчас сервер онлайн, но были добавлены студенты в оффлайн, необходимо синхронизировать их с сервером
                    return readJsonFromCache(event.request) // чтение из кэша ответа на запрос списка студентов
                        .then((students) => {
                            // получение списка добавленных и обновленных в офлайне студентов
                            var offlineStudents = getOfflineStudents(students); 
                            // отправка их на сервер
                            return sendOfflineStudents(offlineStudents);         
                        })
                        .then((response) => {
                            offlineAdded = false;                       // снятие флага наличия на клиенте добавленных в оффлайн студентов
                            return fetchAndPutToCache(event.request);   // получение с сервера синхронизированного списка студентов
                        });
                } else {
                    // если добавленных в оффлайн студентов нет, просто получаем новый список с сервера
                    return fetchAndPutToCache(event.request).catch(function() {
                        getFromCache(event.request);
                    }) 
                }
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



// Добавление или обновление студента в режиме оффлайн 
function addOrModifyStudentOffline(cacheRequest, request) {
    var cachedStudents;
    return readJsonFromCache(cacheRequest)// чтение из кэша ответа на запрос списка студентов
        .then((students) => {                            
            cachedStudents = students;  // сохранение полученных студентов из кэша
            return request.json();      // чтение добавленного студента из запроса
        })
        .then((newStudentData) => {                  
            if (newStudentData.id !== undefined) { // обновление студента
                var existingStudent;
                var existingStudentResult = cachedStudents.filter(function (s){
                    return s.id == newStudentData.id;
                });
                if (existingStudentResult.length === 1) {
                    existingStudent = existingStudentResult[0];
                    existingStudent.name = newStudentData.name;
                    existingStudent.picSrc = newStudentData.picture;
                    existingStudent.bio = newStudentData.bio;
                    existingStudent.modified = true;
                }
            } else { // добавление студента                
                var newStudent = {                  // создание объекта с добавленным студентом
                    id: newStudentData.id,
                    name: newStudentData.name,
                    picSrc: newStudentData.picture,
                    bio: newStudentData.bio
                };
                cachedStudents.push(newStudent);    // добавление нового объекта студента к списку студентов
            }

            // создание нового объекта response, содержащего обновленный список студентов в json
            var newStudentsJsonResponce = new Response(JSON.stringify(cachedStudents), {
                status: 200,
                headers: new Headers({'Content-type': 'application/json; charset=UTF-8'})
            });
            offlineAdded = true;
            // добавление объекта в кэш
            return caches.open(CACHE_NAME)
                .then((cache) => {
                    cache.put(studentsRequest, newStudentsJsonResponce);
                });
        })
        .then(function() {
            return caches.match(request);
        });
}

// Прочитать и десериализовать JSON ответ из кэша для указанного запроса
function readJsonFromCache(request) {
    return caches.match(request)            // чтение запроса из кэша
        .then(function(response) { 
            return response.json();         // получение и десериализация json из тела ответа
        })
        .then(function(cachedResponce) { 
            return cachedResponce;          // возврат десериализованного объекта
        });
}

// Получить добавленных оффлайн стедунтов из списка студентов
function getOfflineStudents(students) {
    var offlineAddedStudents = [];
    var offlineModifiedStudents = [];
    students.forEach(function (student){
        if (student.id === undefined || student.id === 0)
            offlineAddedStudents.push(student);
        else if (student.modified !== undefined && student.modified === true)
            offlineModifiedStudents.push({
                id: student.id,
                name: student.name,
                picSrc: student.picSrc,
                bio: student.bio
            });
    });
    return {
        added: offlineAddedStudents,
        modified: offlineModifiedStudents
    };
}

// Отправить список добавленных и обновленных оффлайн студентов на сервер
function sendOfflineStudents(addedAndModifiedStudents) {
    return fetch('/api/v1/putstudents', {
        method: 'put',
        headers: { 'Content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(addedAndModifiedStudents)
    }).then(function (response) { 
        return response.json(); 
    });
}

// Получить статус сервера: онлайн/оффлайн
function getOnlineState() {
    return new Promise((resolve, reject) => {
        fetch('/').
        then(() => { 
            console.log('ONLINE');
            resolve(true);            
        })
        .catch(() => {             
            console.log('OFFLINE');
            resolve(false);            
        });        
    });    
}