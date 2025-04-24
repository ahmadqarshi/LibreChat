// mock-ldap.js
const ldap = require('ldapjs');

const server = ldap.createServer();
const users = {
  'uid=root,ou=users,dc=example,dc=com': {
    uid: 'root',
    cn: 'Root',
    mail: 'root@example.com',
    userPassword: 'password123',
  },
  'uid=alank,ou=users,dc=example,dc=com': {
    uid: 'alank',
    cn: 'Alan k',
    mail: 'alank@example.com',
    userPassword: 'password123',
  },
  'uid=lynpat,ou=users,dc=example,dc=com': {
    uid: 'lynpat',
    cn: 'Lyn Pat',
    mail: 'lynpat@example.com',
    userPassword: 'password123',
  },
  'uid=ahmadq,ou=users,dc=example,dc=com': {
    uid: 'ahmadq',
    cn: 'Ahmad Qarshi',
    mail: 'ahmadq@example.com',
    userPassword: 'password123',
  },
  'uid=nomanf,ou=users,dc=example,dc=com': {
    uid: 'nomanf',
    cn: 'Noman Fareed',
    mail: 'nomanf@example.com',
    userPassword: 'password123',
  },
  'uid=rayana,ou=users,dc=example,dc=com': {
    uid: 'rayana',
    cn: 'Rayan Ahmad',
    mail: 'rayana@example.com',
    userPassword: 'password123',
  },
  'uid=rohana,ou=users,dc=example,dc=com': {
    uid: 'rohana',
    cn: 'Rohana Ahmad',
    mail: 'rohana@example.com',
    userPassword: 'password123',
  },
  
  // Add more test users as needed
};

server.search('dc=example,dc=com', (req, res, next) => {
  const entries = Object.entries(users)
    .filter(([dn, user]) => {
      // Simple filter matching
      if (req.filter.toString().includes('uid=')) {
        const uidMatch = req.filter.toString().match(/uid=([^)]+)/);
        if (uidMatch && uidMatch[1]) {
          return user.uid === uidMatch[1];
        }
      }
      return true;
    })
    .map(([dn, user]) => {
      const entry = {
        dn,
        attributes: {
          uid: user.uid,
          cn: user.cn,
          mail: user.mail,
        },
      };
      return entry;
    });

  entries.forEach(entry => res.send(entry));
  res.end();
});

server.bind('dc=example,dc=com', (req, res, next) => {
  const dn = req.dn.toString();
  if (users[dn] && users[dn].userPassword === req.credentials) {
    res.end();
    return;
  }
  return next(new ldap.InvalidCredentialsError());
});

server.listen(1389, '127.0.0.1', () => {
  console.log('Mock LDAP server listening at ldap://127.0.0.1:1389');
});