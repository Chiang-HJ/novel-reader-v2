const fs = require('fs'); fetch('https://api.vxtwitter.com/Pokemon/status/1759604114405396656').then(r=>r.text()).then(t => fs.writeFileSync('test_twitter.html', t))
