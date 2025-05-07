const express = require('express');
const router = express.Router();
const connectDb = require('~/lib/db/connectDb');
const { checkAdmin, requireJwtAuth } = require('~/server/middleware');
const { SystemRoles } = require('librechat-data-provider');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');

router.get('/', requireJwtAuth, checkAdmin, async (req, res) => {
    try {
        const mongoose = await connectDb();
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not initialized');
        }
        const { username, fromDate, toDate, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const pipeline = buildTokenStatsPipeline(username, fromDate, toDate, skip, parseInt(limit));
        const [result, countResult] = await Promise.all([
            db.collection('messages').aggregate(pipeline).toArray(),
            db.collection('messages').aggregate(buildCountPipeline(username, fromDate, toDate)).toArray()
        ]);
        const totalCount = result.length > 0 && result[0].metadata && result[0].metadata[0] ? result[0].metadata[0].total : 0;
        const formattedData = result.length > 0 && result[0].data ? result[0].data.map(item => {
            const modelStats = {};
            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(modelData => {
                    modelStats[modelData.model] = modelData.totalTokens;
                });
            }
            return {
                userName: item._id || 'Unknown User',
                ...modelStats,
                totalTokens: item.totalTokens || 0
            };
        }) : [];

        return res.json({
            data: formattedData,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching token statistics:', error.stack);
        return res.status(500).json({ error: error.message || 'Server error' });
    }
});

router.get('/download-csv', requireJwtAuth, checkAdmin, async (req, res) => {
    try {
        const mongoose = await connectDb();
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not initialized');
        }
        const { username, fromDate, toDate } = req.query;
        const pipeline = buildTokenStatsPipeline(username, fromDate, toDate, 0, 0);
        const result = await db.collection('messages').aggregate(pipeline).toArray();

        const rawData = result.length > 0 && result[0].data ? result[0].data : [];

        // Collect all agent IDs to fetch their names
        const allModels = new Set();
        const agentIds = new Set();

        if (rawData.length > 0) {
            rawData.forEach(item => {
                if (item.models && Array.isArray(item.models)) {
                    item.models.forEach(modelData => {
                        if (modelData.model) {
                            const model = modelData.model;
                            allModels.add(model);

                            // Add to agentIds if it starts with 'agent_'
                            if (model.startsWith('agent_')) {
                                agentIds.add(model);
                            }
                        }
                    });
                }
            });
        }

        // Fetch agent names from the database
        const agentMap = {};
        if (agentIds.size > 0) {
            const agents = await db.collection('agents').find({
                id: { $in: Array.from(agentIds) }
            }).toArray();

            agents.forEach(agent => {
                agentMap[agent.id] = agent.name || 'Unnamed Agent';
            });
        }

        // Create the list of model names, replacing agent IDs with agent names
        const modelNames = Array.from(allModels).map(model => {
            if (model.startsWith('agent_') && agentMap[model]) {
                return { id: model, displayName: agentMap[model] };
            } else {
                return { id: model, displayName: model };
            }
        }).sort((a, b) => a.displayName.localeCompare(b.displayName)); // Sort by display name

        const normalizedData = rawData.map(item => {
            const userData = {
                userName: item._id || 'Unknown User',
                totalTokens: item.totalTokens || 0
            };

            // Initialize with zero for all models
            modelNames.forEach(model => {
                userData[model.displayName] = 0;
            });

            if (item.models && Array.isArray(item.models)) {
                item.models.forEach(modelData => {
                    if (modelData.model) {
                        const displayName = modelData.model.startsWith('agent_') && agentMap[modelData.model]
                            ? agentMap[modelData.model]
                            : modelData.model;

                        userData[displayName] = modelData.totalTokens || 0;
                    }
                });
            }

            return userData;
        });

        const fields = [
            { label: 'User Name', value: 'userName' },
            ...modelNames.map(model => ({ label: model.displayName, value: model.displayName })),
            { label: 'Total Tokens', value: 'totalTokens' }
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(normalizedData);

        res.header('Content-Type', 'text/csv');
        res.attachment('token-statistics.csv');
        return res.send(csv);
    } catch (error) {
        console.error('Error generating CSV:', error.stack);
        return res.status(500).json({ error: error.message || 'Server error' });
    }
});

router.get('/download-excel', requireJwtAuth, checkAdmin, async (req, res) => {
    try {
        const mongoose = await connectDb();
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not initialized');
        }
        const { username, fromDate, toDate } = req.query;

        // Modified token stats pipeline to include message creation dates
        const pipeline = [
            {
                $addFields: {
                    user: {
                        $cond: {
                            if: { $eq: [{ $type: '$user' }, 'string'] },
                            then: { $toObjectId: '$user' },
                            else: '$user'
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    'isCreatedByUser': false,
                    'model': { $ne: null },
                    'tokenCount': { $gt: 0 }
                }
            }
        ];

        // Add date and username filters if provided
        const matchStage = buildMatchStage(username, fromDate, toDate);
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // Group by user and model to get total tokens and earliest creation date
        pipeline.push(
            {
                $group: {
                    _id: {
                        userId: '$user',
                        userName: {
                            $ifNull: [
                                {
                                    $concat: [
                                        { $ifNull: ['$userDetails.name', 'Unknown'] },
                                        ' (',
                                        { $ifNull: ['$userDetails.username', 'unknown'] },
                                        ')'
                                    ]
                                },
                                'Unknown User'
                            ]
                        },
                        model: '$model'
                    },
                    totalTokens: { $sum: '$tokenCount' },
                    earliestDate: { $min: '$createdAt' }
                }
            }
        );

        const result = await db.collection('messages').aggregate(pipeline).toArray();

        // Fetch agent information from the database
        const agents = await db.collection('agents').find({}).toArray();
        const agentMap = {};
        agents.forEach(agent => {
            // Use the id field as the key, not _id
            if (agent.id) {
                agentMap[agent.id] = agent;
            }
        });

        const formattedData = [];
        result.forEach(item => {
            const [name, username] = item._id.userName.split(' (');
            const modelId = item._id.model;

            // Check if this is an agent ID
            let modelName = modelId;
            let agentName = '';

            // If the model starts with 'agent_', it's an agent
            if (modelId && modelId.startsWith('agent_')) {
                const agent = agentMap[modelId];

                if (agent) {
                    // If agent found, get the agent name and model
                    agentName = agent.name || 'Unknown Agent';
                    modelName = agent.model || '';
                } else {
                    // If agent not found, leave as is without changes
                    agentName = '';
                    modelName = modelId;
                }
            }

            formattedData.push({
                name: name || 'Unknown',
                username: username ? username.replace(')', '') : 'unknown',
                date: item.earliestDate ? new Date(item.earliestDate).toLocaleDateString('en-GB') : 'Unknown', // DD/MM/YYYY
                model: modelName,
                agent: agentName,
                tokensUsed: item.totalTokens
            });
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Token Statistics');

        const columns = [
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Username', key: 'username', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Model', key: 'model', width: 20 },
            { header: 'Agent', key: 'agent', width: 20 },
            { header: 'Tokens Used', key: 'tokensUsed', width: 12 }
        ];

        worksheet.columns = columns;

        formattedData.forEach(item => {
            worksheet.addRow(item);
        });

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('token-statistics.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel:', error.stack);
        return res.status(500).json({ error: error.message || 'Server error' });
    }
});

function buildTokenStatsPipeline(username, fromDate, toDate, skip, limit) {
    const matchStage = buildMatchStage(username, fromDate, toDate);
    const pipeline = [
        {
            $addFields: {
                user: {
                    $cond: {
                        if: { $eq: [{ $type: '$user' }, 'string'] },
                        then: { $toObjectId: '$user' },
                        else: '$user'
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userDetails'
            }
        },
        { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                debugUser: {
                    userId: '$user',
                    userDetails: '$userDetails',
                    matched: { $cond: { if: { $eq: ['$userDetails', {}] }, then: false, else: true } }
                }
            }
        },
        ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
        {
            $group: {
                _id: {
                    conversationId: '$conversationId',
                    messageId: '$messageId',
                    parentMessageId: '$parentMessageId'
                },
                user: { $first: '$user' },
                userName: {
                    $first: {
                        $ifNull: [
                            {
                                $concat: [
                                    { $ifNull: ['$userDetails.name', 'Unknown'] },
                                    ' (',
                                    { $ifNull: ['$userDetails.username', 'unknown'] },
                                    ')'
                                ]
                            },
                            'Unknown User'
                        ]
                    }
                },
                model: { $first: '$model' },
                tokenCount: { $first: '$tokenCount' },
                isCreatedByUser: { $first: '$isCreatedByUser' },
                documents: { $push: '$$ROOT' }
            }
        },
        { $sort: { '_id.parentMessageId': 1 } },
        {
            $group: {
                _id: '$_id.conversationId',
                messages: { $push: '$$ROOT' }
            }
        },
        {
            $addFields: {
                processedMessages: {
                    $reduce: {
                        input: '$messages',
                        initialValue: [],
                        in: {
                            $concatArrays: [
                                '$$value',
                                [{
                                    user: '$$this.user',
                                    userName: '$$this.userName',
                                    model: {
                                        $cond: {
                                            if: { $eq: ['$$this.model', null] },
                                            then: {
                                                $let: {
                                                    vars: {
                                                        childMessages: {
                                                            $filter: {
                                                                input: '$messages',
                                                                as: 'child',
                                                                cond: { $eq: ['$$child._id.parentMessageId', '$$this._id.messageId'] }
                                                            }
                                                        }
                                                    },
                                                    in: {
                                                        $ifNull: [
                                                            { $arrayElemAt: ['$$childMessages.model', 0] },
                                                            '$$this.model'
                                                        ]
                                                    }
                                                }
                                            },
                                            else: '$$this.model'
                                        }
                                    },
                                    tokenCount: { $ifNull: ['$$this.tokenCount', 0] },
                                    isCreatedByUser: '$$this.isCreatedByUser'
                                }]
                            ]
                        }
                    }
                }
            }
        },
        { $unwind: '$processedMessages' },
        {
            $match: {
                'processedMessages.isCreatedByUser': false,
                'processedMessages.model': { $ne: null },
                'processedMessages.tokenCount': { $gt: 0 }
            }
        },
        {
            $group: {
                _id: {
                    user: '$processedMessages.user',
                    userName: '$processedMessages.userName',
                    model: '$processedMessages.model'
                },
                totalTokens: { $sum: '$processedMessages.tokenCount' }
            }
        },
        {
            $group: {
                _id: '$_id.userName',
                user: { $first: '$_id.user' },
                models: {
                    $push: {
                        model: '$_id.model',
                        totalTokens: '$totalTokens'
                    }
                },
                totalTokens: { $sum: '$totalTokens' }
            }
        },
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [
                    { $sort: { _id: 1 } },
                    ...(skip > 0 || limit > 0 ? [{ $skip: skip }, { $limit: limit }] : [])
                ]
            }
        }
    ];
    return pipeline;
}

function buildCountPipeline(username, fromDate, toDate) {
    const matchStage = buildMatchStage(username, fromDate, toDate);
    return [
        {
            $addFields: {
                user: {
                    $cond: {
                        if: { $eq: [{ $type: '$user' }, 'string'] },
                        then: { $toObjectId: '$user' },
                        else: '$user'
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userDetails'
            }
        },
        { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
        ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
        {
            $group: {
                _id: {
                    $ifNull: [
                        {
                            $concat: [
                                { $ifNull: ['$userDetails.name', 'Unknown'] },
                                ' (',
                                { $ifNull: ['$userDetails.username', 'unknown'] },
                                ')'
                            ]
                        },
                        'Unknown User'
                    ]
                }
            }
        },
        { $count: 'total' }
    ];
}

function buildMatchStage(username, fromDate, toDate) {
    const matchStage = {};

    if (username && username.trim()) {
        matchStage['userDetails.name'] = { $regex: username.trim(), $options: 'i' };
    }

    if (fromDate || toDate) {
        matchStage.createdAt = {};

        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            matchStage.createdAt.$gte = from;
        }

        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            matchStage.createdAt.$lte = to;
        }
    }

    return matchStage;
}


module.exports = router;