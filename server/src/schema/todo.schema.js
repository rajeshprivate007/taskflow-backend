const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  dueDate: {
    type: Date
  },
  dueTime: {
    type: String,
    trim: true
  },
  completedAt: {
    type: Date
  },
  starred: {
    type: Boolean,
    default: false
  },
  archived: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subtasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    text: {
      type: String,
      required: true,
      trim: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
todoSchema.index({ user: 1, createdAt: -1 });
todoSchema.index({ user: 1, status: 1 });
todoSchema.index({ user: 1, priority: 1 });
todoSchema.index({ user: 1, category: 1 });
todoSchema.index({ user: 1, dueDate: 1 });
todoSchema.index({ user: 1, starred: 1 });

// Virtual for completion status
todoSchema.virtual('completed').get(function() {
  return this.status === 'completed';
});

// Pre-save middleware to set completedAt
todoSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

// Instance methods
todoSchema.methods.toggleStatus = function() {
  if (this.status === 'completed') {
    this.status = 'pending';
    this.completedAt = undefined;
  } else {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  return this.save();
};

todoSchema.methods.addSubtask = function(subtaskData) {
  this.subtasks.push(subtaskData);
  return this.save();
};

todoSchema.methods.toggleSubtask = function(subtaskId) {
  const subtask = this.subtasks.id(subtaskId);
  if (subtask) {
    subtask.completed = !subtask.completed;
    return this.save();
  }
  throw new Error('Subtask not found');
};

todoSchema.methods.addComment = function(commentData) {
  this.comments.push(commentData);
  return this.save();
};

// Static methods
todoSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId, archived: false };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.priority) {
    query.priority = options.priority;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.starred !== undefined) {
    query.starred = options.starred;
  }
  
  if (options.search) {
    query.$or = [
      { title: { $regex: options.search, $options: 'i' } },
      { description: { $regex: options.search, $options: 'i' } }
    ];
  }
  
  return this.find(query)
    .sort({ order: 1, createdAt: -1 })
    .populate('user', 'name email')
    .populate('comments.user', 'name email');
};

todoSchema.statics.getStats = function(userId) {
  const now = new Date();
  
  return this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), archived: false } },
    {
      $addFields: {
        // Combine dueDate and dueTime into a single datetime for comparison
        combinedDueDateTime: {
          $cond: {
            if: { $and: ['$dueDate', '$dueTime'] },
            then: {
              $dateFromString: {
                dateString: {
                  $concat: [
                    { $dateToString: { format: '%Y-%m-%d', date: '$dueDate' } },
                    'T',
                    '$dueTime',
                    ':00.000Z'
                  ]
                },
                onError: '$dueDate',
                onNull: '$dueDate'
              }
            },
            else: '$dueDate'
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
        },
        highPriority: {
          $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
        },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'completed'] },
                  { $ne: ['$combinedDueDateTime', null] },
                  { $lt: ['$combinedDueDateTime', now] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

module.exports = mongoose.model('Todo', todoSchema);

