const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Todo = require('../schema/todo.schema');
const auth = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Get all todos for authenticated user
router.get('/', auth, [
  query('status').optional().custom((value) => {
    if (value === 'all' || ['pending', 'in-progress', 'completed'].includes(value)) {
      return true;
    }
    throw new Error('Invalid status value');
  }),
  query('priority').optional().custom((value) => {
    if (value === 'all' || ['low', 'medium', 'high'].includes(value)) {
      return true;
    }
    throw new Error('Invalid priority value');
  }),
  query('category').optional().custom((value) => {
    if (value === 'all' || (typeof value === 'string' && value.trim().length > 0)) {
      return true;
    }
    throw new Error('Invalid category value');
  }),
  query('starred').optional().custom((value) => {
    if (value === 'all' || value === 'true' || value === 'false') {
      return true;
    }
    throw new Error('Invalid starred value');
  }),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest, async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      starred,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const options = {
      search
    };

    // Only add filters if they're not 'all'
    if (status && status !== 'all') {
      options.status = status;
    }
    
    if (priority && priority !== 'all') {
      options.priority = priority;
    }
    
    if (category && category !== 'all') {
      options.category = category;
    }
    
    if (starred && starred !== 'all') {
      options.starred = starred === 'true';
    }

    // Remove undefined values
    Object.keys(options).forEach(key => 
      options[key] === undefined && delete options[key]
    );

    const todos = await Todo.findByUser(req.user.id, options)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Todo.countDocuments({
      user: req.user.id,
      archived: false,
      ...(search && {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      })
    });

    res.json({
      success: true,
      data: {
        todos,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get todo by ID
router.get('/:id', auth, [
  param('id').isMongoId()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate('user', 'name email');

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    res.json({
      success: true,
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Create new todo
router.post('/', auth, [
  body('title').notEmpty().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('category').optional().trim().isLength({ max: 50 }),
  body('tags').optional().isArray(),
  body('dueDate').optional().isISO8601(),
  body('dueTime').optional().isString().trim(),
  body('starred').optional().isBoolean()
], validateRequest, async (req, res) => {
  try {
    const todoData = {
      ...req.body,
      user: req.user.id
    };

    const todo = new Todo(todoData);
    await todo.save();

    res.status(201).json({
      success: true,
      message: 'Todo created successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Update todo
router.put('/:id', auth, [
  param('id').isMongoId(),
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('status').optional().isIn(['pending', 'in-progress', 'completed']),
  body('category').optional().trim().isLength({ max: 50 }),
  body('tags').optional().isArray(),
  body('dueDate').optional().isISO8601(),
  body('dueTime').optional().isString().trim(),
  body('starred').optional().isBoolean(),
  body('order').optional().isNumeric()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    res.json({
      success: true,
      message: 'Todo updated successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Toggle todo status
router.patch('/:id/toggle', auth, [
  param('id').isMongoId()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    await todo.toggleStatus();

    res.json({
      success: true,
      message: 'Todo status toggled successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Delete todo
router.delete('/:id', auth, [
  param('id').isMongoId()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    res.json({
      success: true,
      message: 'Todo deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Archive todo
router.patch('/:id/archive', auth, [
  param('id').isMongoId()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { archived: true },
      { new: true }
    );

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    res.json({
      success: true,
      message: 'Todo archived successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add subtask
router.post('/:id/subtasks', auth, [
  param('id').isMongoId(),
  body('title').notEmpty().trim().isLength({ min: 1, max: 200 })
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    await todo.addSubtask(req.body);

    res.json({
      success: true,
      message: 'Subtask added successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Toggle subtask
router.patch('/:id/subtasks/:subtaskId', auth, [
  param('id').isMongoId(),
  param('subtaskId').isMongoId()
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    await todo.toggleSubtask(req.params.subtaskId);

    res.json({
      success: true,
      message: 'Subtask toggled successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add comment
router.post('/:id/comments', auth, [
  param('id').isMongoId(),
  body('text').notEmpty().trim().isLength({ min: 1, max: 500 })
], validateRequest, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    await todo.addComment({
      ...req.body,
      user: req.user.id
    });

    res.json({
      success: true,
      message: 'Comment added successfully',
      data: todo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get todo statistics
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Todo.getStats(req.user.id);
    
    res.json({
      success: true,
      data: stats[0] || {
        total: 0,
        completed: 0,
        pending: 0,
        inProgress: 0,
        highPriority: 0,
        overdue: 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Bulk operations
router.post('/bulk', auth, [
  body('action').isIn(['delete', 'archive', 'update-status']),
  body('todoIds').isArray({ min: 1 }),
  body('status').optional().isIn(['pending', 'in-progress', 'completed'])
], validateRequest, async (req, res) => {
  try {
    const { action, todoIds, status } = req.body;
    let result;

    switch (action) {
      case 'delete':
        result = await Todo.deleteMany({
          _id: { $in: todoIds },
          user: req.user.id
        });
        break;
      case 'archive':
        result = await Todo.updateMany(
          { _id: { $in: todoIds }, user: req.user.id },
          { archived: true }
        );
        break;
      case 'update-status':
        if (!status) {
          return res.status(400).json({
            success: false,
            message: 'Status is required for update-status action'
          });
        }
        result = await Todo.updateMany(
          { _id: { $in: todoIds }, user: req.user.id },
          { status, completedAt: status === 'completed' ? new Date() : undefined }
        );
        break;
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      data: { modifiedCount: result.modifiedCount || result.deletedCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

