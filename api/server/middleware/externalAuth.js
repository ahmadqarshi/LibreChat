const jwt = require('jsonwebtoken');
const User = require('~/models/User');
const { logger } = require('~/config');
const { createUser, updateUser, countUsers } = require('~/models/userMethods');
const { SystemRoles } = require('librechat-data-provider');
const { setAuthTokens } = require('~/server/services/AuthService');

const externalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    logger.info(`################### THE TOKEN IS: ${token}`);
    if (!token) {
      return next();
    }
    // Verify token with the shared secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    logger.info(`######### THE DECODED TOKEN IS: ${JSON.stringify(decoded)}`);
    // Check if we have the employee ID
    if (!decoded.id && !decoded.sub) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    if (decoded.id) {
      return next();
    }

    // Find or create user based on employee ID
    logger.info(`######### SEARCHING FOR USER WITH externalUserId: ${decoded.sub}`);
    // Check if the externalId field exists in the schema
    logger.info(`######### USER SCHEMA FIELDS: ${Object.keys(User.schema.paths).join(', ')}`);
    // Direct MongoDB query to check what's in the database
    // const db = mongoose.connection.db;
    // const usersCollection = db.collection('users');
    // const directQuery = await usersCollection.find({ externalId: decoded.sub }).toArray();
    // logger.info(`######### DIRECT DB QUERY RESULTS: ${JSON.stringify(directQuery)}`);
    // Since externalId is not in the schema, we need to use a different approach
    // First, try to find a user with the exact externalId
    let user = null;
    // If the direct query returns results, use the first one
    // if (directQuery.length > 0) {
    //   user = await User.findById(directQuery[0]._id);
    //   logger.info(`######### FOUND USER BY ID FROM DIRECT QUERY: ${JSON.stringify(user)}`);
    // } else {
    // If no user found with the exact externalId, try to find a user with null externalId
    // This is a workaround until the schema is properly updated

    user = await User.findOne({ externalUserId: decoded.sub });
    // user = users.find(u => u.externalId === null);
    logger.info(`######### FOUND USER WITH externalUserId: ${JSON.stringify(user)}`);
    // If we found a user with null externalId, update it with the correct externalId
    // if (user) {
    //   user.externalId = decoded.sub;
    //   await user.save();
    //   logger.info(`######### UPDATED USER WITH externalId: ${decoded.sub}`);
    // }
    // }
    if (!user) {
      // Create a new user if one doesn't exist
      const isFirstRegisteredUser = (await countUsers()) === 0;
      user = new User({
        name: decoded.name || `Employee ${decoded.sub}`,
        email: decoded.email || `employee_${decoded.sub}@company.com`,
        // ldapId: decoded.sub,
        provider: 'external',
        role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
        // password: 'Passw0rd!', // No password for externally authenticated users
        emailVerified: true,
        externalUserId: decoded.sub,
      });
      logger.info(`######### SAVING THE USER: ${JSON.stringify(user)}`);
      const userId = await createUser(user);
      user._id = userId;
      logger.info(`######### SAVED THE USER ID: ${userId}`);
    } else {
      // Update user info
      user.provider = 'external';
      user.email = decoded.email;
      user.name = decoded.name;
      user = await updateUser(user._id, user);
    }
    // Generate new token for the user
    const newToken = await setAuthTokens(user._id, res);
    // Set the new token in the response headers
    res.setHeader('Authorization', `Bearer ${newToken}`);
    // Modify the request headers for subsequent middleware
    req.headers.authorization = `Bearer ${newToken}`;
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('External auth error:', error);
    next();
  }
};

module.exports = externalAuthMiddleware;
