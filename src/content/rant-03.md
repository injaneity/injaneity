# Python Decorators

Decorators are a relatively simple concept, but most people don't bother going to understand what is actually going on under the hood - the average Python user knows the annotation @ does *something* to the target function, but it's good to know *exactly* what it does.

```python
def decorator(func):
	def wrapper():
		print("Before the function runs")
		func()
		print("After the function runs")
	return wrapper # note that it is NOT wrapper()

@decorator
def say_hello():
	print("Hello World")
```

Python executes module code top to bottom. It does compile source to bytecode first, but function definitions are still evaluated in order at runtime. Going step by step, the `def decorator(...)` statement creates a **function object** for `decorator`, and `def say_hello(...)` creates one for `say_hello`. The inner `wrapper` function object is created when `decorator(say_hello)` runs.

`@decorator` is decorator syntax: it transforms `say_hello` into `say_hello = decorator(say_hello)`. This returns the **function object** `wrapper` (NOT the function result), and from then on, `say_hello()` points to that `wrapper` function.

> Even though `say_hello` is no longer directly referenced, since the `wrapper` function still references it, it will not be garbage collected till the `wrapper` function is also garbage collected.

```python
def decorator(func):
	def wrapper(*args, **kwargs):
		# do something
		return func(*args, **kwargs)
	return wrapper

@decorator
def is_greater(a, b):
	return b > a
```

For decorated functions with arguments and/or [keyword arguments](/rant-04.md), a generic pass-through wrapper usually uses `*args` and `**kwargs`. This forwards whatever was passed in so the underlying function still runs as expected.
