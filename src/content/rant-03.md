---
created: 2026-02-20
---

# Python Decorators

[Decorators](https://www.geeksforgeeks.org/python/decorators-in-python/) are a relatively simple concept, but most people don't bother understanding what is going on under the hood - the average user knows the fancy `@`  does *something* to the target function, but *what exactly?* 

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

Python executes code top to bottom, with function definitions evaluated in order at runtime. Going step by step, the `def decorator(...)` statement creates a **function object** for `decorator`, and `def say_hello(...)` creates one for `say_hello`.

> The inner `wrapper` function object is created when `decorator(say_hello)` runs, but **not run yet**.

`@decorator` transforms `say_hello` into `say_hello = decorator(say_hello)`. This returns the **function object** `wrapper` (NOT the function result), and from then on, `say_hello()` points to `wrapper`.

> Though `say_hello` is no longer directly referenced, since `wrapper` references it, it will not be garbage collected till `wrapper` is.

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
