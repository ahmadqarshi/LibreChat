const ldapjs = require('ldapjs');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { countUsers } = require('~/models/userMethods');
const { SystemRoles } = require('librechat-data-provider');
const logger = require('~/utils/logger');

const checkUserInAD = async (req, res, next) => {
    try {
    const username1 = req.body.email; // Assuming your login form sends email

    if (!username1) {
        return res.status(400).json({ message: 'Email is required' });
    }


    // Create LDAP client
    const client = ldapjs.createClient({
      url: process.env.LDAP_URL,
      tlsOptions: process.env.LDAP_CA_CERT_PATH ? {
        rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED === 'true',
        ca: require('fs').readFileSync(process.env.LDAP_CA_CERT_PATH),
      } : undefined,
      ...((process.env.LDAP_STARTTLS === 'true') && { starttls: true }),
    });

    // Bind with service account
    await new Promise((resolve, reject) => {
      client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_CREDENTIALS, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Search for the user
    const searchFilter = (process.env.LDAP_SEARCH_FILTER || 'mail={{username}}')
      .replace('{{username}}', username1);

    const searchOptions = {
      scope: 'sub',
      filter: searchFilter,
      attributes: [
        'displayName', 'mail', 'uid', 'cn', 'name',
        'commonname', 'givenName', 'sn', 'sAMAccountName',
        ...(process.env.LDAP_FULL_NAME ? process.env.LDAP_FULL_NAME.split(',') : []),
        ...(process.env.LDAP_ID ? [process.env.LDAP_ID] : []),
        ...(process.env.LDAP_USERNAME ? [process.env.LDAP_USERNAME] : []),
        ...(process.env.LDAP_EMAIL ? [process.env.LDAP_EMAIL] : []),
      ],
    };

    let userFound = false;
    let userinfo = null;

    const searchResult = await new Promise((resolve, reject) => {
      client.search(process.env.LDAP_USER_SEARCH_BASE, searchOptions, (err, res) => {
        if (err) {
          return reject(err);
        }

        const entries = [];

        res.on('searchEntry', (entry) => {
            logger.debug('[checkUserInAD] Found LDAP entry:', JSON.stringify(entry.json));
          
            const userObj = {};
            entry.attributes.forEach(attr => {
              userObj[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            });
          
            entries.push(userObj);
          });
        
        res.on('error', (err) => {
          logger.error('[checkUserInAD] LDAP search error:', err);
          reject(err);
        });
        
        res.on('end', () => {
          logger.debug('[checkUserInAD] LDAP search completed, found entries:', entries.length);
          resolve(entries);
        });
      });
    });
    
    client.unbind();
    
    logger.debug('[checkUserInAD] Search result:', JSON.stringify(searchResult));
    
    if (!searchResult || searchResult.length === 0) {
      return res.status(404).json({ message: 'User not found in Active Directory' });
    }
    
    userinfo = searchResult[0];
    logger.debug('[checkUserInAD] User info:', JSON.stringify(userinfo));

    // Process user info - this code is similar to your ldapLogin strategy
    const ldapId =
      (process.env.LDAP_ID && userinfo[process.env.LDAP_ID]) ||
      userinfo.uid ||
      userinfo.sAMAccountName ||
      userinfo.mail;

    let user = await findUser({ ldapId });

    const fullNameAttributes = process.env.LDAP_FULL_NAME && process.env.LDAP_FULL_NAME.split(',');
    const fullName =
      fullNameAttributes && fullNameAttributes.length > 0
        ? fullNameAttributes.map((attr) => userinfo[attr]).join(' ')
        : userinfo.cn || userinfo.name || userinfo.commonname || userinfo.displayName;

    const username =
      (process.env.LDAP_USERNAME && userinfo[process.env.LDAP_USERNAME]) ||
      userinfo.givenName ||
      userinfo.mail;

    const mail =
      (process.env.LDAP_EMAIL && userinfo[process.env.LDAP_EMAIL]) ||
      userinfo.mail ||
      username + '@ldap.local';

    if (!user) {
      const isFirstRegisteredUser = (await countUsers()) === 0;
      user = {
        provider: 'ldap',
        ldapId,
        username,
        email: mail,
        emailVerified: true,
        name: fullName,
        role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
      };
      const userId = await createUser(user);
      user._id = userId;
    } else {
      // Update user info
      user.provider = 'ldap';
      user.ldapId = ldapId;
      user.email = mail;
      user.username = username;
      user.name = fullName;
      user = await updateUser(user._id, user);
    }

    // Set the user object on the request
    req.user = user;

    next();
  } catch (error) {
    logger.error('[checkUserInAD]', error);
    next(error);
  }
};

module.exports = checkUserInAD;
